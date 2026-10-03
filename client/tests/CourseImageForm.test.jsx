import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";

// The services read Vite's env, which Jest can't parse, so they are stubbed.
jest.unstable_mockModule("../src/services/admin.js", () => ({ MAX_COURSE_IMAGE_BYTES: 5 * 1024 * 1024 }));
jest.unstable_mockModule("../src/services/courses.js", () => ({ courseImageUrl: () => "/cover.png" }));

const CourseForm = (await import("../src/pages/admin/components/course/CourseForm.jsx")).default;
const CourseImageForm = (await import("../src/pages/admin/components/course/CourseImageForm.jsx")).default;

const course = { id: "c1", code: "CC2", title: "Programming", hasImage: false };

const draw = (props = {}) =>
  render(
    <CourseForm course={course} busy={false} onCancel={() => {}} onSave={() => {}}>
      <CourseImageForm course={course} busy={false} progress={0} onUpload={() => {}} onRemove={() => {}} {...props} />
    </CourseForm>
  );

describe("Course picture inside Edit Course", () => {
  it("shows in the form, with Upload and no Remove while empty", () => {
    draw();
    expect(screen.getByText("Course picture")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("uploads the picked file straight away", () => {
    const onUpload = jest.fn();
    const { container } = draw({ onUpload });
    const file = new File(["x"], "cover.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("offers Replace and Remove once there is a picture", () => {
    const onRemove = jest.fn();
    draw({ course: { ...course, hasImage: true }, onRemove });

    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
