// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeCandidate } from "./candidate-analysis";

async function rgbaPng(width: number, height: number, pixels: number[]) {
  return sharp(Uint8Array.from(pixels), { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("candidate analysis", () => {
  it("reports material changes that cross an approximate selection", async () => {
    const source = await rgbaPng(3, 1, [10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255]);
    const candidate = await rgbaPng(3, 1, [200, 10, 10, 255, 200, 10, 10, 255, 10, 10, 10, 255]);
    const mask = await rgbaPng(3, 1, [255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0]);

    const result = await analyzeCandidate({ sourcePng: source, candidatePng: candidate, selectionMaskPng: mask, width: 3, height: 1 });

    expect(result.analysis).toMatchObject({
      changedPixels: 2,
      changedInsideSelectionPixels: 1,
      changedOutsideSelectionPixels: 1,
      classification: "candidate-extends-selection",
      warnings: ["changes-outside-selection", "changes-touch-selection-boundary"],
    });
    expect(await sharp(result.changeMapPng).metadata()).toMatchObject({ width: 3, height: 1, format: "png" });
  });

  it("ignores differences at or below the diagnostic threshold", async () => {
    const source = await rgbaPng(1, 1, [10, 20, 30, 255]);
    const candidate = await rgbaPng(1, 1, [22, 20, 30, 255]);
    const mask = await rgbaPng(1, 1, [255, 255, 255, 255]);
    const result = await analyzeCandidate({ sourcePng: source, candidatePng: candidate, selectionMaskPng: mask, width: 1, height: 1 });
    expect(result.analysis.classification).toBe("no-material-change");
  });
});
