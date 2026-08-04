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

    const result = await analyzeCandidate({ sourcePng: source, candidatePng: candidate, selectionMaskPng: mask, width: 3, height: 1, operation: "replace" });

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
    const result = await analyzeCandidate({ sourcePng: source, candidatePng: candidate, selectionMaskPng: mask, width: 1, height: 1, operation: "replace" });
    expect(result.analysis.classification).toBe("no-material-change");
  });

  it("classifies a Replace proposal dominated by broad outside changes as a scope mismatch", async () => {
    const source = await rgbaPng(8, 1, Array(8).fill([10, 10, 10, 255]).flat());
    const candidate = await rgbaPng(8, 1, Array(8).fill([200, 10, 10, 255]).flat());
    const mask = await rgbaPng(8, 1, [
      255, 255, 255, 255, 255, 255, 255, 255,
      ...Array(6).fill([255, 255, 255, 0]).flat(),
    ]);

    const result = await analyzeCandidate({ sourcePng: source, candidatePng: candidate, selectionMaskPng: mask, width: 8, height: 1, operation: "replace" });

    expect(result.analysis).toMatchObject({
      changedInsideSelectionPixels: 2,
      changedOutsideSelectionPixels: 6,
      changedOutsideSelectionRatio: 1,
      classification: "replace-scope-mismatch",
    });
    expect(result.analysis.warnings).toContain("replace-scope-mismatch");
  });

  it("does not apply the Replace scope guard to other generative operations", async () => {
    const source = await rgbaPng(4, 1, Array(4).fill([10, 10, 10, 255]).flat());
    const candidate = await rgbaPng(4, 1, Array(4).fill([200, 10, 10, 255]).flat());
    const mask = await rgbaPng(4, 1, [255, 255, 255, 255, ...Array(3).fill([255, 255, 255, 0]).flat()]);

    const result = await analyzeCandidate({ sourcePng: source, candidatePng: candidate, selectionMaskPng: mask, width: 4, height: 1, operation: "restyle" });

    expect(result.analysis.classification).toBe("candidate-extends-selection");
  });
});
