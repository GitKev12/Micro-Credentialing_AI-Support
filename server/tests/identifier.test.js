import { describe, it, expect } from "@jest/globals";
import { idNumberMatch, loginFilter, readIdentifier, readIdNumber } from "../src/auth/identifier.js";

/**
 * Students and assessors sign in with an ID number or an email, so whatever is
 * typed at the login is what reaches the database filter.
 */
describe("readIdentifier", () => {
  it("trims what was typed", () => {
    expect(readIdentifier("  ana@tsu.edu.ph ")).toBe("ana@tsu.edu.ph");
    expect(readIdentifier(202300001)).toBe("202300001");
  });

  // An object reaching the filter is read as an operator: { $ne: "" } matches
  // the first account in the collection.
  it("reads anything else as empty, so it is refused", () => {
    expect(readIdentifier({ $ne: "" })).toBe("");
    expect(readIdentifier(["ASS001"])).toBe("");
    expect(readIdentifier(null)).toBe("");
    expect(readIdentifier(undefined)).toBe("");
    expect(readIdentifier("   ")).toBe("");
  });
});

describe("readIdNumber", () => {
  it("capitalises, the way ID numbers are stored", () => {
    expect(readIdNumber("  ass001 ")).toBe("ASS001");
    expect(readIdNumber("202300001")).toBe("202300001");
  });
});

describe("idNumberMatch", () => {
  it("finds a stored ID number whatever case was typed", () => {
    expect(idNumberMatch("ass001").$in).toContain("ASS001");
    expect(idNumberMatch("ASS001").$in).toContain("ass001");
  });

  it("keeps the typed spelling for a row stored in mixed case", () => {
    expect(idNumberMatch("Ass001").$in).toContain("Ass001");
  });

  it("does not repeat a value that has no case", () => {
    expect(idNumberMatch("202300001")).toEqual({ $in: ["202300001"] });
  });
});

describe("loginFilter — ID number or email", () => {
  it("looks an ID number up in the collection's own ID field", () => {
    expect(loginFilter("ass001", "assessor_id")).toEqual({
      assessor_id: { $in: ["ASS001", "ass001"] }
    });
    expect(loginFilter("202300001", "student_id")).toEqual({
      student_id: { $in: ["202300001"] }
    });
  });

  it("looks anything with an @ up as an email, whatever case was typed", () => {
    expect(loginFilter("Ana@TSU.edu.ph", "student_id")).toEqual({
      email: { $in: ["ana@tsu.edu.ph", "Ana@TSU.edu.ph"] }
    });
    expect(loginFilter("ana@tsu.edu.ph", "student_id")).toEqual({
      email: { $in: ["ana@tsu.edu.ph"] }
    });
  });

  it("never lets an operator object through", () => {
    expect(loginFilter({ $ne: "" }, "student_id")).toEqual({ student_id: { $in: [""] } });
  });
});
