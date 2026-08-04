import { describe, expect, it } from "vitest";
import { monochromePixels } from "./monochrome";

describe("monochromePixels", () => {
  it("converts RGB to luminance and preserves alpha", () => {
    const pixels = monochromePixels({ width: 2, height: 1, pixels: new Uint8ClampedArray([255, 0, 0, 80, 0, 255, 0, 160]) });
    expect([...pixels]).toEqual([54, 54, 54, 80, 182, 182, 182, 160]);
  });

  it("rejects pixel buffers that do not match their dimensions", () => {
    expect(() => monochromePixels({ width: 2, height: 2, pixels: new Uint8ClampedArray(4) })).toThrow(/dimensions/);
  });
});
