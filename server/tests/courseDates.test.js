import { describe, it, expect } from "@jest/globals";
import { readCourseDate, readCourseDates, toIsoDay } from "../src/lib/courseDates.js";

describe("readCourseDate", () => {
  it("reads a date-input value as the day it names, in UTC", () => {
    const { value } = readCourseDate("2026-08-04", "The start date");
    expect(value.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("keeps the day when a full timestamp comes in", () => {
    const { value } = readCourseDate("2026-08-04T13:45:00.000Z", "The start date");
    expect(value.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("treats blank as cleared rather than as an error", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expect(readCourseDate(blank, "The end date")).toEqual({ value: null });
    }
  });

  it("names the field it could not read", () => {
    const { error, value } = readCourseDate("next term", "The end date");
    expect(value).toBeUndefined();
    expect(error).toMatch(/^The end date/);
  });
});

describe("readCourseDates", () => {
  // A course written before the field existed can still be renamed. It is
  // touching a date that obliges the request to leave a whole run behind.
  it("leaves an edit that mentions no date alone", () => {
    expect(readCourseDates({ title: "Ignored" })).toEqual({ dates: {} });
  });

  it("returns only the fields the body mentioned", () => {
    const stored = { startsOn: new Date("2026-08-04T00:00:00.000Z") };
    expect(readCourseDates({ endsOn: "2026-10-10" }, stored).dates).toEqual({
      endsOn: new Date("2026-10-10T00:00:00.000Z")
    });
  });

  it("will not take one date on its own", () => {
    const half = "A course needs both a start date and an end date.";
    expect(readCourseDates({ startsOn: "2026-08-04" }).error).toBe(half);
    expect(readCourseDates({ endsOn: "2026-10-10" }).error).toBe(half);
    expect(readCourseDates({}, {}, { required: true }).error).toBe(half);
  });

  it("accepts a run in order, and a one-day run", () => {
    expect(readCourseDates({ startsOn: "2026-08-04", endsOn: "2026-10-10" }).error).toBeUndefined();
    expect(readCourseDates({ startsOn: "2026-08-04", endsOn: "2026-08-04" }).error).toBeUndefined();
  });

  it("rejects an end before the start", () => {
    const { error, dates } = readCourseDates({ startsOn: "2026-10-10", endsOn: "2026-08-04" });
    expect(dates).toBeUndefined();
    expect(error).toBe("The end date cannot be before the start date.");
  });

  // The half a PATCH does not send is the half already on the document, which
  // is the only way a one-field edit can be judged at all.
  it("checks a one-field edit against the stored course", () => {
    const stored = { startsOn: new Date("2026-10-10T00:00:00.000Z") };
    expect(readCourseDates({ endsOn: "2026-08-04" }, stored).error).toBe(
      "The end date cannot be before the start date."
    );
    expect(readCourseDates({ endsOn: "2026-12-01" }, stored).error).toBeUndefined();
  });

  it("refuses to empty one half of a run that is already set", () => {
    const stored = {
      startsOn: new Date("2026-10-10T00:00:00.000Z"),
      endsOn: new Date("2026-12-01T00:00:00.000Z")
    };
    expect(readCourseDates({ startsOn: "" }, stored).error).toBe(
      "A course needs both a start date and an end date."
    );
  });
});

describe("toIsoDay", () => {
  it("reports what is stored, and null for what is not", () => {
    expect(toIsoDay(new Date("2026-08-04T00:00:00.000Z"))).toBe("2026-08-04T00:00:00.000Z");
    expect(toIsoDay("2026-08-04T00:00:00.000Z")).toBe("2026-08-04T00:00:00.000Z");
    expect(toIsoDay(null)).toBeNull();
    expect(toIsoDay(undefined)).toBeNull();
    expect(toIsoDay("whenever")).toBeNull();
  });
});
