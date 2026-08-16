import sharp from "sharp";
import type { CandidateAnalysis } from "@/shared/edit-boundary";

interface AnalyzeCandidateInput {
  sourcePng: Uint8Array;
  candidatePng: Uint8Array;
  selectionMaskPng: Uint8Array;
  width: number;
  height: number;
  operation: "remove" | "replace" | "restyle" | "transform";
}

export interface CandidateAnalysisResult {
  analysis: CandidateAnalysis;
  changeMapPng: Uint8Array;
}

const differenceThreshold = 12;
const selectionThreshold = 16;
const replaceOutsideCoverageThreshold = 0.25;
const replaceOutsideChangeShareThreshold = 0.75;

/** Measures candidate scope without changing or deriving the pixels shown to the user. */
export async function analyzeCandidate(input: AnalyzeCandidateInput): Promise<CandidateAnalysisResult> {
  const [source, candidate, mask] = await Promise.all([
    sharp(input.sourcePng).ensureAlpha().resize(input.width, input.height, { fit: "fill" }).raw().toBuffer(),
    sharp(input.candidatePng).ensureAlpha().resize(input.width, input.height, { fit: "fill" }).raw().toBuffer(),
    sharp(input.selectionMaskPng).ensureAlpha().resize(input.width, input.height, { fit: "fill" }).raw().toBuffer(),
  ]);
  const pixelCount = input.width * input.height;
  const selected = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) selected[index] = mask[index * 4 + 3] > selectionThreshold ? 1 : 0;

  let selectedPixels = 0;
  let changedPixels = 0;
  let changedInsideSelectionPixels = 0;
  let changedOutsideSelectionPixels = 0;
  let changedBoundaryPixels = 0;
  const changeMap = Buffer.alloc(pixelCount * 4);

  for (let index = 0; index < pixelCount; index += 1) {
    const pixel = index * 4;
    if (selected[index]) selectedPixels += 1;
    const difference = Math.max(
      Math.abs(candidate[pixel] - source[pixel]),
      Math.abs(candidate[pixel + 1] - source[pixel + 1]),
      Math.abs(candidate[pixel + 2] - source[pixel + 2]),
      Math.abs(candidate[pixel + 3] - source[pixel + 3]),
    );
    if (difference <= differenceThreshold) continue;
    changedPixels += 1;
    if (selected[index]) changedInsideSelectionPixels += 1;
    else changedOutsideSelectionPixels += 1;
    if (touchesSelectionBoundary(selected, index, input.width, input.height)) changedBoundaryPixels += 1;
    changeMap[pixel] = 239;
    changeMap[pixel + 1] = 75;
    changeMap[pixel + 2] = 50;
    changeMap[pixel + 3] = Math.min(230, 80 + difference);
  }

  const outsidePixels = pixelCount - selectedPixels;
  const changedOutsideSelectionRatio = ratio(changedOutsideSelectionPixels, outsidePixels);
  const replaceScopeMismatch = input.operation === "replace"
    && changedOutsideSelectionRatio >= replaceOutsideCoverageThreshold
    && ratio(changedOutsideSelectionPixels, changedPixels) >= replaceOutsideChangeShareThreshold;
  const warnings: CandidateAnalysis["warnings"] = [];
  if (changedOutsideSelectionPixels > 0) warnings.push("changes-outside-selection");
  if (changedBoundaryPixels > 0) warnings.push("changes-touch-selection-boundary");
  if (replaceScopeMismatch) warnings.push("replace-scope-mismatch");
  const analysis: CandidateAnalysis = {
    differenceThreshold,
    changedPixels,
    changedPixelRatio: ratio(changedPixels, pixelCount),
    changedInsideSelectionPixels,
    changedInsideSelectionRatio: ratio(changedInsideSelectionPixels, selectedPixels),
    changedOutsideSelectionPixels,
    changedOutsideSelectionRatio,
    changedBoundaryPixels,
    classification: changedPixels === 0
      ? "no-material-change"
      : replaceScopeMismatch
        ? "replace-scope-mismatch"
        : changedOutsideSelectionPixels > 0
          ? "candidate-extends-selection"
          : "candidate-within-selection",
    warnings,
  };
  const changeMapPng = await sharp(changeMap, { raw: { width: input.width, height: input.height, channels: 4 } }).png().toBuffer();
  return { analysis, changeMapPng };
}

function touchesSelectionBoundary(selected: Uint8Array, index: number, width: number, height: number): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  const value = selected[index];
  if (x > 0 && selected[index - 1] !== value) return true;
  if (x + 1 < width && selected[index + 1] !== value) return true;
  if (y > 0 && selected[index - width] !== value) return true;
  return y + 1 < height && selected[index + width] !== value;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round(numerator / denominator * 1_000_000) / 1_000_000;
}
