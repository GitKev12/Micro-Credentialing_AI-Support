import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import mongoose from "mongoose";

/*
 * A delete only goes through once the record is archived. Uses a fake
 * database; nothing here touches a real one.
 */

jest.unstable_mockModule("../src/lib/mongo.js", () => ({
  collectionExists: async () => true,
  idCandidates: (value) => [value]
}));

const { deleteStudent, deleteAssessor } = await import("../src/admin/accounts.controller.js");
const { deleteClass } = await import("../src/admin/classes.controller.js");
const { deleteCourse } = await import("../src/admin/modules.controller.js");

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

let record;
let deletes;

beforeEach(() => {
  deletes = 0;
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  mongoose.connection.collection = () => ({
    findOne: async () => record,
    deleteOne: async () => {
      deletes += 1;
    },
    deleteMany: async () => {
      deletes += 1;
      return { deletedCount: 0 };
    }
  });
});

const cases = [
  ["student", deleteStudent, { _id: "s1", archived: false }, "Archive this account before deleting it."],
  ["assessor", deleteAssessor, { _id: "a1" }, "Archive this account before deleting it."],
  ["class", deleteClass, { _id: "k1", archived: false }, "Archive this class before deleting it."],
  ["course", deleteCourse, { _id: "c1", status: "inactive" }, "Archive this course before deleting it."]
];

describe("deleting something that is not archived", () => {
  for (const [label, handler, notArchived, message] of cases) {
    it(`refuses the ${label}`, async () => {
      record = notArchived;
      const res = reply();
      await handler({ params: { id: notArchived._id } }, res);

      expect(res.code).toBe(409);
      expect(res.body.message).toBe(message);
      expect(deletes).toBe(0);
    });
  }
});
