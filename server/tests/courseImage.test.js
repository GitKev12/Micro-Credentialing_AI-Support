import { describe, it, expect } from "@jest/globals";
import { imageTypeOf, MAX_COURSE_IMAGE_BYTES } from "../src/admin/modules.controller.js";

/** A buffer that starts with these bytes and is long enough to be sniffed. */
const starting = (...bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

const png = starting(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const jpeg = starting(0xff, 0xd8, 0xff, 0xe0);
const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)]);
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
  Buffer.alloc(16)
]);

describe("imageTypeOf", () => {
  it("recognises the four formats a browser will draw", () => {
    expect(imageTypeOf(png)).toBe("image/png");
    expect(imageTypeOf(jpeg)).toBe("image/jpeg");
    expect(imageTypeOf(gif)).toBe("image/gif");
    expect(imageTypeOf(webp)).toBe("image/webp");
  });

  // The type the browser declares is not evidence: it comes from the file's
  // extension, so a renamed file would sail past a header check.
  it("refuses anything else, whatever it is called", () => {
    expect(imageTypeOf(Buffer.from("%PDF-1.7\nnot a picture"))).toBeNull();
    expect(imageTypeOf(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageTypeOf(Buffer.from("RIFF____AVI LIST"))).toBeNull();
  });

  it("has nothing to say about an empty or truncated upload", () => {
    expect(imageTypeOf(null)).toBeNull();
    expect(imageTypeOf(Buffer.alloc(0))).toBeNull();
    expect(imageTypeOf(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe("MAX_COURSE_IMAGE_BYTES", () => {
  it("is the 5 MB the form and the router both quote", () => {
    expect(MAX_COURSE_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });
});
