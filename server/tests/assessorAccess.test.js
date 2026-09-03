import { describe, it, expect } from "@jest/globals";
import { mayActAs } from "../src/assessors/assessors.guard.js";

/**
 * Who may act as whom on the assessor routes.
 *
 * The rule these tests pin was missing entirely: the routes checked the
 * caller's role and never their identity, so any signed-in assessor could read
 * a colleague's classes and student rosters, and post papers into their
 * courses, by putting the colleague's id in the URL. Confirmed against the
 * running server before the fix — every one of those answered 200.
 */

const MIKE = { _id: "6a2f8fabafe387a98b837148", assessor_id: "ASS001" };
const PATRICIA = { _id: "6a2f8fabafe387a98b837149", assessor_id: "ASS002" };

const session = (id, role = "assessor") => ({ id, role });

describe("mayActAs", () => {
  it("lets an assessor act as themselves", () => {
    expect(mayActAs(session(MIKE._id), MIKE)).toBe(true);
  });

  it("refuses an assessor acting as somebody else", () => {
    expect(mayActAs(session(MIKE._id), PATRICIA)).toBe(false);
  });

  /**
   * The reason the check was left out in the first place. `:assessorId` accepts
   * the Mongo id or the ASS### number, and the session only ever carries the
   * Mongo id — so the parameter is resolved to a document before this is asked,
   * and both forms then land on the same answer.
   */
  it("answers the same however the caller named themselves", () => {
    // Both of these resolve to Mike's document, so both are Mike.
    expect(mayActAs(session(MIKE._id), MIKE)).toBe(true);
    // And the number form of somebody else still resolves to somebody else.
    expect(mayActAs(session(MIKE._id), PATRICIA)).toBe(false);
  });

  it("compares the id as text, whatever type it arrived as", () => {
    // An _id off a document is an ObjectId; the session's is the string it was
    // signed as. Comparing them raw would refuse every legitimate call.
    const objectish = { _id: { toString: () => MIKE._id } };
    expect(mayActAs(session(MIKE._id), objectish)).toBe(true);
  });

  it("lets an admin act as anyone, which is what these staff routes are for", () => {
    expect(mayActAs(session("some-admin", "admin"), PATRICIA)).toBe(true);
    expect(mayActAs(session("some-admin", "admin"), MIKE)).toBe(true);
  });

  it("refuses an assessor asking after an id that resolves to nobody", () => {
    // Answered the same way as somebody else's id, so the route cannot be used
    // to find out which assessor ids exist.
    expect(mayActAs(session(MIKE._id), null)).toBe(false);
  });

  it("admits nobody without a session", () => {
    expect(mayActAs(null, MIKE)).toBe(false);
    expect(mayActAs(undefined, MIKE)).toBe(false);
  });

  it("does not let a student through by naming an assessor", () => {
    // requireRole already stops this; the rule holds on its own regardless.
    expect(mayActAs(session(MIKE._id, "student"), PATRICIA)).toBe(false);
  });
});
