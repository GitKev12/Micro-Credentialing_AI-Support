import { describe, it, expect } from "@jest/globals";
import { studentName, surnameFirst } from "../src/assessors/assessors.controller.js";

/**
 * Two ways of writing the same person.
 *
 * `studentName` is how a student is addressed — on their own page, in a
 * sentence about them, in a notice. `surnameFirst` is how they are listed in
 * a register that is read down the column to find one row, where the surname
 * has to be the first thing in the cell for the alphabetical order to be
 * visible at all.
 */
describe("writing a student's name", () => {
  const student = { first_name: "Chris Jerome", last_name: "Dayan" };

  it("addresses them given name first", () => {
    expect(studentName(student)).toBe("Chris Jerome Dayan");
  });

  it("lists them surname first, with the given name behind the comma", () => {
    expect(surnameFirst(student)).toBe("Dayan, Chris Jerome");
  });

  /**
   * Half a name cannot be turned round. "Cruz," with nothing after it reads as
   * a fault in the screen rather than as somebody's name, so a record missing
   * either half falls back to being written the ordinary way.
   */
  it("does not turn round a name it only has half of", () => {
    expect(surnameFirst({ first_name: "Ana" })).toBe("Ana");
    expect(surnameFirst({ last_name: "Cruz" })).toBe("Cruz");
    expect(surnameFirst({ full_name: "Ana Cruz" })).toBe("Ana Cruz");
    expect(surnameFirst({ email: "ana@tsu.edu.ph" })).toBe("ana@tsu.edu.ph");
  });

  // Whitespace either side of a stored name is not a name.
  it("does not put the comma after nothing", () => {
    expect(surnameFirst({ first_name: "Ana", last_name: "   " })).toBe("Ana");
  });

  it("has something to say about a record with no name at all", () => {
    expect(surnameFirst({})).toBe("Unnamed student");
  });
});
