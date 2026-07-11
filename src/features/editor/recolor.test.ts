import { describe, expect, it } from "vitest";
import { createMask } from "./mask";
import { recolorPixels } from "./recolor";
import type { ImageVersion } from "./types";

const input: ImageVersion = {
  id: "v0", parentVersionId: null, width: 3, height: 1, mediaType: "image/png", dataUrl: "data:",
  pixels: new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80, 180, 190, 200, 210]),
};

describe("recolorPixels", () => {
  it("preserves source lightness, alpha, and every unselected byte", () => {
    const mask = createMask(3, 1);
    mask.data[0] = 255;
    const output = recolorPixels(input, mask, "#ff0000");
    expect([...output]).toEqual([40, 0, 0, 40, 50, 60, 70, 80, 180, 190, 200, 210]);
    expect([...input.pixels]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 180, 190, 200, 210]);
  });

  it("retains texture differences between selected pixels", () => {
    const mask = createMask(3, 1);
    mask.data.fill(255);
    const output = recolorPixels(input, mask, "#00ff00");
    expect(output[1]).toBeLessThan(output[5]);
    expect(output[5]).toBeLessThan(output[9]);
  });

  it("blends real partial mask boundaries", () => {
    const mask = createMask(3, 1);
    mask.data[0] = 128;
    const full = recolorPixels(input, { ...mask, data: new Uint8ClampedArray([255, 0, 0]) }, "#ff0000");
    const partial = recolorPixels(input, mask, "#ff0000");
    expect(partial[0]).toBeGreaterThan(input.pixels[0]);
    expect(partial[0]).toBeLessThan(full[0]);
    expect(partial[3]).toBe(input.pixels[3]);
  });

  it("rejects masks with different dimensions", () => {
    expect(() => recolorPixels(input, createMask(1, 1), "#ffffff")).toThrow(/dimensions/);
  });
});
