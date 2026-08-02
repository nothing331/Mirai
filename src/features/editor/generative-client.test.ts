import { describe, expect, it } from "vitest";
import { createMask } from "./mask";
import { prepareGenerativePreviewPixels } from "./generative-client";

describe("generative preview boundary policy", () => {
  const input = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
  const candidate = new Uint8ClampedArray([100, 110, 120, 255, 200, 210, 220, 255]);
  const mask = createMask(2, 1);
  mask.data[0] = 255;

  it("preserves the complete provider candidate in review mode", () => {
    expect([...prepareGenerativePreviewPixels(input, candidate, mask, "review")]).toEqual([...candidate]);
  });

  it("restores pixels outside the mask in protected mode", () => {
    expect([...prepareGenerativePreviewPixels(input, candidate, mask, "protected")]).toEqual([
      100, 110, 120, 255,
      40, 50, 60, 255,
    ]);
  });
});
