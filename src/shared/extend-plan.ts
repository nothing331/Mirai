import { z } from "zod";
import type { ExtendPresetId } from "./extend-presets";

const normalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const subjectSchema = z.object({
  label: z.string().min(1).max(120),
  bounds: normalizedRectSchema,
  importance: z.number().min(0).max(1),
  touchesEdge: z.boolean(),
  mustPreserve: z.boolean(),
});

export const extendSceneAnalysisSchema = z.object({
  primarySubjects: z.array(subjectSchema).max(12),
  secondarySubjects: z.array(subjectSchema.omit({ mustPreserve: true })).max(16),
  textRegions: z.array(z.object({ bounds: normalizedRectSchema, importance: z.number().min(0).max(1) })).max(16),
  horizonY: z.number().min(0).max(1).nullable(),
  visualCenter: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  negativeSpaceRegions: z.array(normalizedRectSchema).max(12),
  edgeContinuation: z.object({ top: z.string().max(240), right: z.string().max(240), bottom: z.string().max(240), left: z.string().max(240) }),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(160)).max(8),
});

export type ExtendSceneAnalysis = z.infer<typeof extendSceneAnalysisSchema>;
export type ExtendStrategy = "smart" | "preserve-all";

export interface PixelRect { x: number; y: number; width: number; height: number }

export interface SmartReframeDecision {
  solverVersion: 2;
  axis: "horizontal" | "vertical" | "none";
  preferredCropSize: number;
  minimumSafeSize: number;
  chosenCropSize: number;
  cropOrigin: number;
  candidateCount: number;
  fallbackReason: "keep-full" | "low-confidence" | "protected-span" | "aspect-match" | null;
}

export interface SmartReframePlan {
  schemaVersion: 1 | 2;
  strategy: ExtendStrategy;
  presetId: ExtendPresetId;
  presetVersion: 1;
  inputWidth: number;
  inputHeight: number;
  sourceCrop: PixelRect;
  sourcePlacement: PixelRect;
  outputWidth: number;
  outputHeight: number;
  expansionInsets: { top: number; right: number; bottom: number; left: number };
  seamWidth: number;
  cropAreaRatio: number;
  generatedAreaRatio: number;
  confidence: number;
  rationale: string[];
  warnings: string[];
  decision?: SmartReframeDecision;
}

export interface ExtendPlanInput {
  width: number;
  height: number;
  presetId: ExtendPresetId;
  presetVersion: 1;
  ratio: readonly [number, number];
  strategy: ExtendStrategy;
  analysis: ExtendSceneAnalysis;
}

/** Verifies that every padded must-preserve subject and important text region remains inside the retained source crop. */
export function preservesProtectedExtendContent(plan: SmartReframePlan, analysis: ExtendSceneAnalysis): boolean {
  const crop = plan.sourceCrop;
  return protectedRectsForAnalysis(analysis).every((rect) => {
    const left = Math.floor(rect.x * plan.inputWidth);
    const top = Math.floor(rect.y * plan.inputHeight);
    const right = Math.ceil((rect.x + rect.width) * plan.inputWidth);
    const bottom = Math.ceil((rect.y + rect.height) * plan.inputHeight);
    return crop.x <= left && crop.y <= top && crop.x + crop.width >= right && crop.y + crop.height >= bottom;
  });
}

/** Converts semantic scene evidence into conservative, integer output geometry. */
export function solveSmartReframe(input: ExtendPlanInput): SmartReframePlan {
  const { width, height, ratio, analysis } = input;
  const targetRatio = ratio[0] / ratio[1];
  const preserveAll = input.strategy === "preserve-all" || analysis.confidence < 0.65;
  const protectedRects = protectedRectsForAnalysis(analysis);
  let crop = { x: 0, y: 0, width, height };
  const currentRatio = width / height;
  let decision: SmartReframeDecision = {
    solverVersion: 2,
    axis: "none",
    preferredCropSize: currentRatio > targetRatio ? width : height,
    minimumSafeSize: currentRatio > targetRatio ? width : height,
    chosenCropSize: currentRatio > targetRatio ? width : height,
    cropOrigin: 0,
    candidateCount: 1,
    fallbackReason: preserveAll ? input.strategy === "preserve-all" ? "keep-full" : "low-confidence" : "aspect-match",
  };

  if (!preserveAll && Math.abs(currentRatio - targetRatio) > 0.001) {
    if (currentRatio > targetRatio) {
      const desiredWidth = Math.max(Math.ceil(width * 0.75), Math.min(width, Math.round(height * targetRatio)));
      const result = bestHorizontalCrop(width, height, desiredWidth, analysis.visualCenter.x, protectedRects, analysis.negativeSpaceRegions);
      crop = result.crop;
      decision = result.decision;
    } else {
      const desiredHeight = Math.max(Math.ceil(height * 0.75), Math.min(height, Math.round(width / targetRatio)));
      const result = bestVerticalCrop(width, height, desiredHeight, analysis.visualCenter.y, protectedRects, analysis.negativeSpaceRegions);
      crop = result.crop;
      decision = result.decision;
    }
  }

  let outputWidth = crop.width;
  let outputHeight = crop.height;
  if (crop.width / crop.height > targetRatio) outputHeight = Math.ceil(crop.width / targetRatio);
  else outputWidth = Math.ceil(crop.height * targetRatio);

  // Keep the requested rational ratio exact without resampling retained pixels.
  const multiplier = Math.ceil(Math.max(outputWidth / ratio[0], outputHeight / ratio[1]));
  outputWidth = multiplier * ratio[0];
  outputHeight = multiplier * ratio[1];
  const x = Math.floor((outputWidth - crop.width) / 2);
  const preferredY = analysis.horizonY === null ? 0.5 : analysis.horizonY;
  const availableY = outputHeight - crop.height;
  const y = Math.max(0, Math.min(availableY, Math.round(availableY * Math.max(0.25, Math.min(0.75, preferredY)))));
  const sourcePlacement = { x, y, width: crop.width, height: crop.height };
  const generatedPixels = outputWidth * outputHeight - crop.width * crop.height;
  const cropRatio = 1 - (crop.width * crop.height) / (width * height);
  const fellBack = input.strategy === "smart" && preserveAll;
  return {
    schemaVersion: 2,
    strategy: preserveAll ? "preserve-all" : "smart",
    presetId: input.presetId,
    presetVersion: input.presetVersion,
    inputWidth: width,
    inputHeight: height,
    sourceCrop: crop,
    sourcePlacement,
    outputWidth,
    outputHeight,
    expansionInsets: { top: y, right: outputWidth - x - crop.width, bottom: outputHeight - y - crop.height, left: x },
    seamWidth: Math.max(0, Math.min(48, Math.floor((Math.min(crop.width, crop.height) - 1) / 2), Math.max(8, Math.round(Math.min(crop.width, crop.height) * 0.025)))),
    cropAreaRatio: cropRatio,
    generatedAreaRatio: generatedPixels / (outputWidth * outputHeight),
    confidence: analysis.confidence,
    rationale: cropRatio > 0.001 ? [`Removed ${Math.round(cropRatio * 100)}% low-value outer space before extending the target frame.`] : ["Kept the complete source image and generated only the missing frame."],
    warnings: fellBack ? ["Smart analysis confidence was low, so the complete source image was preserved.", ...analysis.warnings] : analysis.warnings,
    decision,
  };
}

function protectedRectsForAnalysis(analysis: ExtendSceneAnalysis): Array<{ x: number; y: number; width: number; height: number }> {
  return [
    ...analysis.primarySubjects.filter((subject) => subject.mustPreserve).map((subject) => subject.bounds),
    ...analysis.textRegions.filter((region) => region.importance >= 0.5).map((region) => region.bounds),
  ].map((rect) => {
    const x = Math.max(0, rect.x - 0.03);
    const y = Math.max(0, rect.y - 0.03);
    return {
      x,
      y,
      width: Math.min(1, rect.x + rect.width + 0.03) - x,
      height: Math.min(1, rect.y + rect.height + 0.03) - y,
    };
  });
}

function bestHorizontalCrop(width: number, height: number, preferredWidth: number, focusX: number, protectedRects: Array<{ x: number; y: number; width: number; height: number }>, negativeSpaceRegions: Array<{ x: number; y: number; width: number; height: number }>): { crop: PixelRect; decision: SmartReframeDecision } {
  const requiredLeft = Math.floor(Math.min(...protectedRects.map((rect) => rect.x * width), width));
  const requiredRight = Math.ceil(Math.max(...protectedRects.map((rect) => (rect.x + rect.width) * width), 0));
  const minimumSafeWidth = Math.max(1, requiredRight - requiredLeft);
  const cropWidth = Math.min(width, Math.max(preferredWidth, minimumSafeWidth));
  const maxX = width - cropWidth;
  const preferred = Math.round(focusX * width - cropWidth / 2);
  const minX = Math.max(0, requiredRight - cropWidth);
  const maxValidX = Math.min(maxX, requiredLeft);
  if (minX > maxValidX) return fullWidthFallback(width, height, preferredWidth, minimumSafeWidth);
  const candidates = cropOrigins(minX, maxValidX, preferred, cropWidth, width, negativeSpaceRegions.map((region) => ({ start: region.x * width, end: (region.x + region.width) * width })));
  const x = chooseBestOrigin(candidates, cropWidth, width, focusX * width, negativeSpaceRegions.map((region) => ({ start: region.x * width, end: (region.x + region.width) * width, weight: region.height })));
  return {
    crop: { x, y: 0, width: cropWidth, height },
    decision: { solverVersion: 2, axis: "horizontal", preferredCropSize: preferredWidth, minimumSafeSize: minimumSafeWidth, chosenCropSize: cropWidth, cropOrigin: x, candidateCount: candidates.length, fallbackReason: cropWidth === width && minimumSafeWidth >= width ? "protected-span" : null },
  };
}

function bestVerticalCrop(width: number, height: number, preferredHeight: number, focusY: number, protectedRects: Array<{ x: number; y: number; width: number; height: number }>, negativeSpaceRegions: Array<{ x: number; y: number; width: number; height: number }>): { crop: PixelRect; decision: SmartReframeDecision } {
  const requiredTop = Math.floor(Math.min(...protectedRects.map((rect) => rect.y * height), height));
  const requiredBottom = Math.ceil(Math.max(...protectedRects.map((rect) => (rect.y + rect.height) * height), 0));
  const minimumSafeHeight = Math.max(1, requiredBottom - requiredTop);
  const cropHeight = Math.min(height, Math.max(preferredHeight, minimumSafeHeight));
  const maxY = height - cropHeight;
  const preferred = Math.round(focusY * height - cropHeight / 2);
  const minY = Math.max(0, requiredBottom - cropHeight);
  const maxValidY = Math.min(maxY, requiredTop);
  if (minY > maxValidY) return fullHeightFallback(width, height, preferredHeight, minimumSafeHeight);
  const candidates = cropOrigins(minY, maxValidY, preferred, cropHeight, height, negativeSpaceRegions.map((region) => ({ start: region.y * height, end: (region.y + region.height) * height })));
  const y = chooseBestOrigin(candidates, cropHeight, height, focusY * height, negativeSpaceRegions.map((region) => ({ start: region.y * height, end: (region.y + region.height) * height, weight: region.width })));
  return {
    crop: { x: 0, y, width, height: cropHeight },
    decision: { solverVersion: 2, axis: "vertical", preferredCropSize: preferredHeight, minimumSafeSize: minimumSafeHeight, chosenCropSize: cropHeight, cropOrigin: y, candidateCount: candidates.length, fallbackReason: cropHeight === height && minimumSafeHeight >= height ? "protected-span" : null },
  };
}

function cropOrigins(minimum: number, maximum: number, preferred: number, cropSize: number, sourceSize: number, negativeSpaces: Array<{ start: number; end: number }>): number[] {
  const values = new Set<number>([minimum, maximum, clampInteger(preferred, minimum, maximum)]);
  for (const region of negativeSpaces) {
    values.add(clampInteger(Math.round(region.end), minimum, maximum));
    values.add(clampInteger(Math.round(region.start - cropSize), minimum, maximum));
  }
  return [...values].filter((origin) => origin >= 0 && origin + cropSize <= sourceSize).sort((a, b) => a - b);
}

function chooseBestOrigin(candidates: number[], cropSize: number, sourceSize: number, focus: number, negativeSpaces: Array<{ start: number; end: number; weight: number }>): number {
  return candidates.reduce((best, candidate) => {
    const score = cropScore(candidate, cropSize, sourceSize, focus, negativeSpaces);
    const bestScore = cropScore(best, cropSize, sourceSize, focus, negativeSpaces);
    if (score !== bestScore) return score > bestScore ? candidate : best;
    const candidateDistance = Math.abs(candidate + cropSize / 2 - focus);
    const bestDistance = Math.abs(best + cropSize / 2 - focus);
    return candidateDistance < bestDistance ? candidate : best;
  }, candidates[0] ?? 0);
}

function cropScore(origin: number, cropSize: number, sourceSize: number, focus: number, negativeSpaces: Array<{ start: number; end: number; weight: number }>): number {
  const keptStart = origin;
  const keptEnd = origin + cropSize;
  const removedNegativeSpace = negativeSpaces.reduce((sum, region) => {
    const regionSize = Math.max(0, region.end - region.start);
    const keptSize = Math.max(0, Math.min(keptEnd, region.end) - Math.max(keptStart, region.start));
    return sum + Math.max(0, regionSize - keptSize) * region.weight;
  }, 0) / Math.max(1, sourceSize);
  const focusDistance = Math.abs(origin + cropSize / 2 - focus) / Math.max(1, sourceSize);
  return removedNegativeSpace * 4 - focusDistance;
}

function fullWidthFallback(width: number, height: number, preferredSize: number, minimumSafeSize: number): { crop: PixelRect; decision: SmartReframeDecision } {
  return { crop: { x: 0, y: 0, width, height }, decision: { solverVersion: 2, axis: "horizontal", preferredCropSize: preferredSize, minimumSafeSize, chosenCropSize: width, cropOrigin: 0, candidateCount: 0, fallbackReason: "protected-span" } };
}

function fullHeightFallback(width: number, height: number, preferredSize: number, minimumSafeSize: number): { crop: PixelRect; decision: SmartReframeDecision } {
  return { crop: { x: 0, y: 0, width, height }, decision: { solverVersion: 2, axis: "vertical", preferredCropSize: preferredSize, minimumSafeSize, chosenCropSize: height, cropOrigin: 0, candidateCount: 0, fallbackReason: "protected-span" } };
}

function clampInteger(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Math.round(value))); }
