import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";
import { fakeCollections } from "./fakeMongo.js";

/**
 * Lesson text is prepared in the background, not while a student waits.
 *
 * The slow part (reading the PDF, OCR, figures) is replaced by a stand-in, so
 * these test the jobs around it: the stored status, the cache, one job per
 * lesson, recovery after a restart, and what the routes answer meanwhile.
 */

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

const VERSION = 28;
const prepareModuleText = jest.fn();
jest.unstable_mockModule("../src/modules/extraction/prepareModuleText.js", () => ({
  TEXT_FORMAT_VERSION: VERSION,
  prepareModuleText
}));

const removeModuleFigures = jest.fn(async () => {});
jest.unstable_mockModule("../src/modules/extraction/figureStore.js", () => ({
  removeModuleFigures,
  storeModuleFigures: jest.fn(async () => [])
}));

const { queueModuleExtraction, readModuleText, resumeExtractionJobs, whenExtractionIdle } = await import(
  "../src/modules/extraction/extractionJobs.js"
);
const { getModuleSections, getModuleText } = await import("../src/modules/modules.controller.js");
const { createCourseModule } = await import("../src/admin/modules.controller.js");

const reply = () => ({
  code: 200,
  body: null,
  headers: {},
  set(name, value) { this.headers[name] = value; return this; },
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; }
});

async function call(handler, request) {
  const res = reply();
  // Signed in as an admin: the reader's student-only checks (locks, closed
  // classes, assess-only) are covered by their own tests and pass straight through.
  await handler({ params: {}, query: {}, session: { role: "admin", id: "a1" }, ...request }, res);
  return res;
}

const lesson = (extra) => ({
  _id: "m1",
  title: "Creating Java Programs",
  fileId: "f1",
  fileType: "pdf",
  contentType: "application/pdf",
  courseId: "c1",
  ...extra
});

// What a finished preparation hands back.
const content = (moduleId = "m1") => ({
  moduleId,
  fileId: "f1",
  formatVersion: VERSION,
  title: "Creating Java Programs",
  numPages: 3,
  pages: [{ page: 1, text: "Java programs start in main." }],
  blocks: [{ type: "paragraph", text: "Java programs start in main." }],
  sections: [{ id: "s1", title: "Introduction", start: 0, end: 1 }],
  readingMinutes: 1,
  textLength: 28,
  hasText: true,
  source: "embedded-text",
  extractedAt: new Date()
});

const readyRecord = (extra) => ({ ...content(), status: "ready", ...extra });

let db;
beforeEach(() => {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  db = { LearningModule: [lesson()], ModuleText: [] };
  mongoose.connection.collection = fakeCollections(db);
  prepareModuleText.mockReset();
  prepareModuleText.mockImplementation(async (module) => content(String(module._id)));
  removeModuleFigures.mockClear();
});

const textFor = (moduleId = "m1") => db.ModuleText.find((doc) => doc.moduleId === moduleId);

describe("queueModuleExtraction", () => {
  it("writes a queued status and prepares the lesson after the caller returns", async () => {
    const status = await queueModuleExtraction(lesson());

    expect(status).toBe("queued");
    expect(textFor().status).toBe("queued");
    expect(textFor().fileId).toBe("f1");
    expect(textFor().formatVersion).toBe(VERSION);
    // Nothing heavy ran inside the call itself.
    expect(prepareModuleText).not.toHaveBeenCalled();

    await whenExtractionIdle();

    expect(prepareModuleText).toHaveBeenCalledTimes(1);
    expect(textFor().status).toBe("ready");
    expect(textFor().blocks).toHaveLength(1);
    expect(textFor().error).toBeNull();
  });

  it("starts one job when the same lesson is asked for several times at once", async () => {
    const answers = await Promise.all([
      queueModuleExtraction(lesson()),
      queueModuleExtraction(lesson()),
      queueModuleExtraction(lesson())
    ]);
    await whenExtractionIdle();

    expect(answers).toEqual(["queued", "queued", "queued"]);
    expect(prepareModuleText).toHaveBeenCalledTimes(1);
    expect(db.ModuleText).toHaveLength(1);
  });

  it("runs one job at a time", async () => {
    db.LearningModule.push(lesson({ _id: "m2", title: "Using Data" }));
    let inFlight = 0;
    let most = 0;
    prepareModuleText.mockImplementation(async (module) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return content(String(module._id));
    });

    await queueModuleExtraction(lesson());
    await queueModuleExtraction(lesson({ _id: "m2", title: "Using Data" }));
    await whenExtractionIdle();

    expect(prepareModuleText).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it("does not prepare a lesson again when its PDF and formatter haven't changed", async () => {
    db.ModuleText.push(readyRecord());

    expect(await queueModuleExtraction(lesson())).toBe("ready");
    await whenExtractionIdle();

    expect(prepareModuleText).not.toHaveBeenCalled();
  });

  it("counts a record from before job statuses existed as ready", async () => {
    const { status: _status, ...legacy } = readyRecord();
    db.ModuleText.push(legacy);

    expect((await readModuleText(lesson())).status).toBe("ready");
    expect(await queueModuleExtraction(lesson())).toBe("ready");
    expect(prepareModuleText).not.toHaveBeenCalled();
  });

  it("prepares it again when the formatter version is newer than the cache", async () => {
    db.ModuleText.push(readyRecord({ formatVersion: VERSION - 1 }));

    expect((await readModuleText(lesson())).status).toBe("missing");
    expect(await queueModuleExtraction(lesson())).toBe("queued");
    await whenExtractionIdle();

    expect(prepareModuleText).toHaveBeenCalledTimes(1);
    expect(textFor().formatVersion).toBe(VERSION);
    expect(textFor().status).toBe("ready");
  });

  it("prepares it again when the lesson points at a different PDF", async () => {
    db.ModuleText.push(readyRecord({ fileId: "old-file" }));

    expect(await queueModuleExtraction(lesson())).toBe("queued");
    await whenExtractionIdle();

    expect(textFor().fileId).toBe("f1");
  });

  it("marks a job failed with the reason, and doesn't retry it on its own", async () => {
    prepareModuleText.mockRejectedValue(new Error("Module file is missing from storage."));

    await queueModuleExtraction(lesson());
    await whenExtractionIdle();

    expect(textFor().status).toBe("failed");
    expect(textFor().error).toEqual({ message: "Module file is missing from storage." });

    expect(await queueModuleExtraction(lesson())).toBe("failed");
    await whenExtractionIdle();
    expect(prepareModuleText).toHaveBeenCalledTimes(1);
  });

  it("skips a lesson deleted while it waited, and leaves nothing behind", async () => {
    await queueModuleExtraction(lesson());
    // What deleting a lesson does (purgeModule), before the job's turn comes.
    db.LearningModule = [];
    db.ModuleText = [];
    await whenExtractionIdle();

    expect(prepareModuleText).not.toHaveBeenCalled();
    expect(db.ModuleText).toHaveLength(0);
  });

  it("drops the figures of a lesson deleted while it was being prepared", async () => {
    prepareModuleText.mockImplementation(async (module) => {
      db.LearningModule = [];
      db.ModuleText = [];
      return content(String(module._id));
    });

    await queueModuleExtraction(lesson());
    await whenExtractionIdle();

    expect(db.ModuleText).toHaveLength(0);
    expect(removeModuleFigures).toHaveBeenCalledWith("m1");
  });
});

describe("resumeExtractionJobs", () => {
  it("picks up queued and interrupted jobs after a restart", async () => {
    db.LearningModule.push(lesson({ _id: "m2", title: "Using Data" }));
    db.ModuleText.push(
      { moduleId: "m1", fileId: "f1", formatVersion: VERSION, status: "extracting", startedAt: new Date() },
      { moduleId: "m2", fileId: "f1", formatVersion: VERSION, status: "queued", queuedAt: new Date() }
    );

    expect(await resumeExtractionJobs()).toBe(2);
    await whenExtractionIdle();

    expect(prepareModuleText).toHaveBeenCalledTimes(2);
    expect(textFor("m1").status).toBe("ready");
    expect(textFor("m2").status).toBe("ready");
  });

  it("leaves finished jobs alone", async () => {
    db.ModuleText.push(readyRecord());

    expect(await resumeExtractionJobs()).toBe(0);
    await whenExtractionIdle();
    expect(prepareModuleText).not.toHaveBeenCalled();
  });
});

describe("GET /modules/:moduleId/text", () => {
  it("serves a ready lesson straight from the cache", async () => {
    db.ModuleText.push(readyRecord());

    const res = await call(getModuleText, { params: { moduleId: "m1" } });

    expect(res.code).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.blocks).toEqual([{ type: "paragraph", text: "Java programs start in main." }]);
    expect(prepareModuleText).not.toHaveBeenCalled();
  });

  it("answers 202 for a lesson not prepared yet, and only queues it", async () => {
    const res = await call(getModuleText, { params: { moduleId: "m1" } });

    expect(res.code).toBe(202);
    expect(res.body).toMatchObject({ id: "m1", status: "queued" });
    expect(res.headers["Retry-After"]).toBe("3");
    // The extraction did not run inside the student's request.
    expect(prepareModuleText).not.toHaveBeenCalled();
    expect(textFor().status).toBe("queued");

    await whenExtractionIdle();
    const next = await call(getModuleText, { params: { moduleId: "m1" } });
    expect(next.code).toBe(200);
    expect(next.body.status).toBe("ready");
  });

  it("says extracting while the job is running", async () => {
    db.ModuleText.push({ moduleId: "m1", fileId: "f1", formatVersion: VERSION, status: "extracting" });

    const res = await call(getModuleText, { params: { moduleId: "m1" } });

    expect(res.code).toBe(202);
    expect(res.body.status).toBe("extracting");
  });

  it("says failed for a lesson that couldn't be prepared", async () => {
    db.ModuleText.push({
      moduleId: "m1", fileId: "f1", formatVersion: VERSION, status: "failed", error: { message: "bad PDF" }
    });

    const res = await call(getModuleText, { params: { moduleId: "m1" } });

    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ status: "failed", message: "This lesson couldn't be prepared." });
    // The technical reason stays on the server.
    expect(JSON.stringify(res.body)).not.toContain("bad PDF");
    expect(prepareModuleText).not.toHaveBeenCalled();
  });
});

describe("GET /modules/:moduleId/sections", () => {
  it("returns the sections of a ready lesson", async () => {
    db.ModuleText.push(readyRecord());

    const res = await call(getModuleSections, { params: { moduleId: "m1" } });

    expect(res.body.status).toBe("ready");
    expect(res.body.sections).toHaveLength(1);
  });

  it("reports the status of a lesson not ready yet, without queueing it", async () => {
    const res = await call(getModuleSections, { params: { moduleId: "m1" } });
    await whenExtractionIdle();

    expect(res.code).toBe(202);
    expect(res.body).toMatchObject({ status: "missing", sections: [] });
    expect(db.ModuleText).toHaveLength(0);
    expect(prepareModuleText).not.toHaveBeenCalled();
  });
});

describe("Uploading a lesson", () => {
  // GridFS stand-in: an upload "finishes" as soon as it is ended.
  const realBucket = Object.getOwnPropertyDescriptor(mongoose.mongo, "GridFSBucket");
  beforeAll(() => {
    class FakeBucket {
      openUploadStream() {
        const handlers = {};
        return {
          id: "f-new",
          on(event, handler) { handlers[event] = handler; return this; },
          end() { handlers.finish?.(); }
        };
      }
      delete() { return Promise.resolve(); }
    }
    Object.defineProperty(mongoose.mongo, "GridFSBucket", { value: FakeBucket, configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(mongoose.mongo, "GridFSBucket", realBucket);
  });

  it("returns the lesson at once with a queued status, then prepares it in the background", async () => {
    db.Course = [{ _id: "c1", courseCode: "CC2", courseName: "Computer Programming 2" }];
    db.LearningModule = [];

    const res = await call(createCourseModule, {
      params: { id: "c1" },
      query: { title: "Using Data", fileName: "using-data.pdf" },
      body: Buffer.from("%PDF-1.7 a small lesson"),
      session: { role: "admin", id: "a1" }
    });

    expect(res.code).toBe(201);
    expect(res.body.module).toMatchObject({ title: "Using Data", textStatus: "queued" });
    expect(db.LearningModule).toHaveLength(1);

    const moduleId = String(db.LearningModule[0]._id);
    expect(textFor(moduleId).status).toBe("queued");
    // The response went back before any extraction ran.
    expect(prepareModuleText).not.toHaveBeenCalled();

    await whenExtractionIdle();
    expect(prepareModuleText).toHaveBeenCalledTimes(1);
    expect(textFor(moduleId).status).toBe("ready");
  });
});
