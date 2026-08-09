import { describe, expect, it } from "vitest";
import { cropPixels, flipPixels, resizePixels, rotatePixels } from "./local-transforms";
import type { ImageVersion } from "./types";

const image: ImageVersion = {
  id: "source", parentVersionId: null, width: 3, height: 2, mediaType: "image/png", dataUrl: "data:",
  pixels: new Uint8ClampedArray([
    1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255,
    4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
  ]),
};

const red = (pixels: Uint8ClampedArray) => Array.from(pixels).filter((_, index) => index % 4 === 0);

describe("local transforms", () => {
  it("crops the exact integer source rectangle", () => {
    const result = cropPixels(image, { x: 1, y: 0, width: 2, height: 2 });
    expect([result.width, result.height]).toEqual([2, 2]);
    expect(red(result.pixels)).toEqual([2, 3, 5, 6]);
  });

  it("rotates clockwise and swaps dimensions", () => {
    const result = rotatePixels(image, 1);
    expect([result.width, result.height]).toEqual([2, 3]);
    expect(red(result.pixels)).toEqual([4, 1, 5, 2, 6, 3]);
  });

  it("four clockwise rotations restore every byte", () => {
    let current = image;
    for (let index = 0; index < 4; index += 1) {
      const next = rotatePixels(current, 1);
      current = { ...current, ...next };
    }
    expect(current.pixels).toEqual(image.pixels);
  });

  it("flipping twice restores every byte", () => {
    const once = flipPixels(image, "horizontal");
    const twice = flipPixels({ ...image, ...once }, "horizontal");
    expect(twice.pixels).toEqual(image.pixels);
  });

  it("resizes to exact dimensions and retains corner colors", () => {
    const result = resizePixels(image, 6, 4);
    expect([result.width, result.height, result.pixels.length]).toEqual([6, 4, 96]);
    expect(result.pixels[0]).toBe(1);
    expect(result.pixels.at(-4)).toBe(6);
  });
});
