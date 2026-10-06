import { describe, expect, it } from "@jest/globals";

const { discoverRefusal, enrollmentOf, isOpenOnDiscover } = await import("../src/admin/classEnrollment.js");

describe("Discover enrollment rules", () => {
  const activeCourse = { _id: "c1", status: "active", endsOn: "2099-12-31" };
  const openClass = { posted: true, active: true, archived: false, assessorIds: ["a1"] };

  it("defaults old classes to needs approval", () => {
    expect(enrollmentOf({})).toBe("approval");
    expect(enrollmentOf({ enrollment: "open" })).toBe("open");
  });

  it("opens only posted classes that can take a student", () => {
    expect(isOpenOnDiscover(openClass, activeCourse)).toBe(true);
    expect(isOpenOnDiscover({ ...openClass, posted: false }, activeCourse)).toBe(false);
  });

  it("names the reason a class cannot be posted", () => {
    expect(discoverRefusal(openClass, { ...activeCourse, status: "inactive" })).toBe("This course isn't active.");
    expect(discoverRefusal({ ...openClass, active: false }, activeCourse)).toBe("This class is switched off.");
    expect(discoverRefusal({ ...openClass, assessorIds: [] }, activeCourse)).toBe("This class needs an assessor first.");
  });
});
