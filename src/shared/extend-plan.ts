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

export interface SmartReframePlan {
  schemaVersion: 1;
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

/** Converts semantic scene evidence into conservative, integer output geometry. */
export function solveSmartReframe(input: ExtendPlanInput): SmartReframePlan {
  const { width, height, ratio, analysis } = input;
  const targetRatio = ratio[0] / ratio[1];
  const preserveAll = input.strategy === "preserve-all" || analysis.confidence < 0.65;
  const protectedRects = [
    ...analysis.primarySubjects.filter((subject) => subject.mustPreserve).map((subject) => subject.bounds),
    ...analysis.textRegions.filter((region) => region.importance >= 0.5).map((region) => region.bounds),
  ].map((rect) => ({
    x: Math.max(0, rect.x - 0.03),
    y: Math.max(0, rect.y - 0.03),
    width: Math.min(1, rect.x + rect.width + 0.03) - Math.max(0, rect.x - 0.03),
    height: Math.min(1, rect.y + rect.height + 0.03) - Math.max(0, rect.y - 0.03),
  }));
  let crop = { x: 0, y: 0, width, height };
  const currentRatio = width / height;

  if (!preserveAll && Math.abs(currentRatio - targetRatio) > 0.001) {
    if (currentRatio > targetRatio) {
      const desiredWidth = Math.max(Math.ceil(width * 0.75), Math.min(width, Math.round(height * targetRatio)));
      crop = bestHorizontalCrop(width, height, desiredWidth, analysis.visualCenter.x, protectedRects);
    } else {
      const desiredHeight = Math.max(Math.ceil(height * 0.75), Math.min(height, Math.round(width / targetRatio)));
      crop = bestVerticalCrop(width, height, desiredHeight, analysis.visualCenter.y, protectedRects);
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
    schemaVersion: 1,
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
    rationale: cropRatio > 0.001 ? ["Removed low-value outer space before extending the target frame."] : ["Kept the complete source image and generated only the missing frame."],
    warnings: fellBack ? ["Smart analysis confidence was low, so the complete source image was preserved.", ...analysis.warnings] : analysis.warnings,
  };
}

function bestHorizontalCrop(width: number, height: number, cropWidth: number, focusX: number, protectedRects: Array<{ x: number; y: number; width: number; height: number }>): PixelRect {
  const maxX = width - cropWidth;
  const preferred = Math.round(focusX * width - cropWidth / 2);
  const requiredLeft = Math.floor(Math.min(...protectedRects.map((rect) => rect.x * width), width));
  const requiredRight = Math.ceil(Math.max(...protectedRects.map((rect) => (rect.x + rect.width) * width), 0));
  const minX = Math.max(0, requiredRight - cropWidth);
  const maxValidX = Math.min(maxX, requiredLeft);
  if (minX > maxValidX) return { x: 0, y: 0, width, height };
  return { x: Math.max(minX, Math.min(maxValidX, preferred)), y: 0, width: cropWidth, height };
}

function bestVerticalCrop(width: number, height: number, cropHeight: number, focusY: number, protectedRects: Array<{ x: number; y: number; width: number; height: number }>): PixelRect {
  const maxY = height - cropHeight;
  const preferred = Math.round(focusY * height - cropHeight / 2);
  const requiredTop = Math.floor(Math.min(...protectedRects.map((rect) => rect.y * height), height));
  const requiredBottom = Math.ceil(Math.max(...protectedRects.map((rect) => (rect.y + rect.height) * height), 0));
  const minY = Math.max(0, requiredBottom - cropHeight);
  const maxValidY = Math.min(maxY, requiredTop);
  if (minY > maxValidY) return { x: 0, y: 0, width, height };
  return { x: 0, y: Math.max(minY, Math.min(maxValidY, preferred)), width, height: cropHeight };
}
