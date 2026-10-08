import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import mongoose from "mongoose";

// A fake database holding one class. Nothing here touches a real database.
jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

const { updateClass } = await import("../src/admin/classes.controller.js");

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

let writes;

beforeEach(() => {
  writes = 0;
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  mongoose.connection.collection = () => ({
    findOne: async () => ({ _id: "k1", name: "Section-A", courseId: "c1", studentIds: [], assessorIds: [] }),
    updateOne: async () => {
      writes += 1;
    }
  });
});

describe("a class after it is created", () => {
  for (const body of [{ name: "Section-B" }, { courseId: "c2" }, { mode: "assessOnly" }]) {
    it(`refuses changing ${Object.keys(body)[0]}`, async () => {
      const res = reply();
      await updateClass({ params: { id: "k1" }, body }, res);

      expect(res.code).toBe(400);
      expect(res.body.message).toBe("Only the assessor, students, schedule and enrollment can be changed after a class is created.");
      expect(writes).toBe(0);
    });
  }
});
