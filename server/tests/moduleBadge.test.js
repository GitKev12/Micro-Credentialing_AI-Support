import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import mongoose from "mongoose";

/*
 * Adding a badge to one lesson. Uses a fake database; nothing here touches a real one.
 */

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

const { readBadgeIcon, saveModuleBadge, deleteModuleBadge } = await import(
  "../src/admin/badges.controller.js"
);

const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64")}`;
const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64")}`;

const reply = () => ({
  code: 200,
  body: null,
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

let badge;
let written;

beforeEach(() => {
  badge = null;
  written = [];
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  mongoose.connection.collection = (name) => ({
    findOne: async () => {
      if (name === "LearningModule") return { _id: "m1", title: "Arrays", courseCode: "CC2" };
      if (name === "Badge") return badge;
      return null;
    },
    find: () => ({ toArray: async () => [{ _id: "m1", title: "Arrays", fileName: "Chapter-2.pdf" }] }),
    insertOne: async (doc) => {
      written.push(["insert", doc]);
      return { insertedId: "b1" };
    },
    updateOne: async (_filter, update) => written.push(["update", update.$set]),
    deleteMany: async () => ({ deletedCount: badge ? 1 : 0 })
  });
});

const save = async (body) => {
  const res = reply();
  await saveModuleBadge({ params: { moduleId: "m1" }, body }, res);
  return res;
};

describe("the badge picture", () => {
  it("takes a PNG and an SVG", () => {
    expect(readBadgeIcon(png).icon).toMatch(/^data:image\/png;base64,/);
    expect(readBadgeIcon(svg).icon).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("refuses something that is not an image, whatever it claims", () => {
    const fake = `data:image/png;base64,${Buffer.from("hello there, not a picture").toString("base64")}`;
    expect(readBadgeIcon(fake).error).toBeTruthy();
    expect(readBadgeIcon("not a data url").error).toBeTruthy();
  });

  it("refuses a picture over 100 KB", () => {
    const big = `data:image/png;base64,${Buffer.alloc(101 * 1024, 0x89).toString("base64")}`;
    expect(readBadgeIcon(big).error).toMatch(/100 KB/);
  });
});

describe("saving a lesson's badge", () => {
  it("needs a name", async () => {
    const res = await save({ title: " ", icon: png });
    expect(res.code).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("needs a picture when the lesson has no badge yet", async () => {
    const res = await save({ title: "Arrays" });
    expect(res.code).toBe(400);
    expect(res.body.message).toBe("Add a picture for the badge.");
  });

  it("creates it switched off unless Enable access is ticked", async () => {
    const res = await save({ title: "Arrays", description: "", icon: png });
    expect(res.code).toBe(201);
    const [, doc] = written[0];
    expect(doc.active).toBe(false);
    expect(doc.moduleId).toBe("m1");
    expect(doc.earnedBy).toBe("quiz-pass");
    expect(doc.order).toBe(1);
  });

  it("edits the existing one and keeps its picture", async () => {
    badge = { _id: "b1", moduleId: "m1", icon: svg, active: false };
    const res = await save({ title: "Arrays badge", active: true });
    expect(res.code).toBe(200);
    expect(written[0][0]).toBe("update");
    expect(res.body.badge).toMatchObject({ title: "Arrays badge", icon: svg, active: true });
  });
});

describe("deleting a lesson's badge", () => {
  it("says so when there is none", async () => {
    const res = reply();
    await deleteModuleBadge({ params: { moduleId: "m1" } }, res);
    expect(res.code).toBe(404);
  });
});
