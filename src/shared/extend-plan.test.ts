import { describe, expect, it } from "vitest";
import { preservesProtectedExtendContent, solveSmartReframe, type ExtendSceneAnalysis } from "./extend-plan";

const analysis: ExtendSceneAnalysis = {
  primarySubjects: [{ label: "person", bounds: { x: 0.4, y: 0.2, width: 0.2, height: 0.65 }, importance: 1, touchesEdge: false, mustPreserve: true }],
  secondarySubjects: [], textRegions: [], horizonY: 0.4, visualCenter: { x: 0.5, y: 0.5 }, negativeSpaceRegions: [],
  edgeContinuation: { top: "sky", right: "field", bottom: "ground", left: "field" }, confidence: 0.9, warnings: [],
};

describe("Smart Reframe geometry", () => {
  it("crops only outer landscape space and returns an exact portrait ratio", () => {
    const plan = solveSmartReframe({ width: 1600, height: 900, presetId: "instagram-classic", presetVersion: 1, ratio: [4, 5], strategy: "smart", analysis });
    expect(plan.outputWidth / plan.outputHeight).toBe(4 / 5);
    expect(plan).toMatchObject({ inputWidth: 1600, inputHeight: 900 });
    expect(plan.sourceCrop.width).toBeGreaterThanOrEqual(1200);
    expect(plan.sourceCrop.x).toBeLessThanOrEqual(640);
    expect(plan.sourceCrop.x + plan.sourceCrop.width).toBeGreaterThanOrEqual(960);
    expect(plan).toMatchObject({ schemaVersion: 2, decision: { solverVersion: 2, axis: "horizontal" } });
  });

  it("expands the preferred crop to the minimum safe subject span instead of abandoning the crop", () => {
    const rocketAnalysis: ExtendSceneAnalysis = {
      primarySubjects: [
        { label: "rocket", bounds: { x: 0.245, y: 0.075, width: 0.515, height: 0.765 }, importance: 1, touchesEdge: false, mustPreserve: true },
        { label: "exhaust", bounds: { x: 0, y: 0.335, width: 0.555, height: 0.665 }, importance: 0.95, touchesEdge: true, mustPreserve: true },
      ],
      secondarySubjects: [], textRegions: [], horizonY: null, visualCenter: { x: 0.43, y: 0.52 },
      negativeSpaceRegions: [{ x: 0.73, y: 0.02, width: 0.27, height: 0.98 }],
      edgeContinuation: { top: "sky", right: "sky", bottom: "exhaust", left: "exhaust" }, confidence: 0.98, warnings: [],
    };

    const plan = solveSmartReframe({ width: 2880, height: 1800, presetId: "instagram-portrait", presetVersion: 1, ratio: [3, 4], strategy: "smart", analysis: rocketAnalysis });

    expect(plan.sourceCrop).toEqual({ x: 0, y: 0, width: 2276, height: 1800 });
    expect(plan.outputWidth).toBe(2277);
    expect(plan.outputHeight).toBe(3036);
    expect(plan.cropAreaRatio).toBeCloseTo(0.21, 2);
    expect(plan.generatedAreaRatio).toBeLessThan(0.42);
    expect(plan.decision).toMatchObject({ preferredCropSize: 2160, minimumSafeSize: 2276, chosenCropSize: 2276, fallbackReason: null });
  });

  it("keeps the complete axis only when protected content spans it", () => {
    const spanningAnalysis: ExtendSceneAnalysis = {
      ...analysis,
      primarySubjects: [{ label: "panorama", bounds: { x: 0, y: 0.2, width: 1, height: 0.6 }, importance: 1, touchesEdge: true, mustPreserve: true }],
    };
    const plan = solveSmartReframe({ width: 1600, height: 900, presetId: "instagram-classic", presetVersion: 1, ratio: [4, 5], strategy: "smart", analysis: spanningAnalysis });
    expect(plan.sourceCrop.width).toBe(1600);
    expect(plan.decision?.fallbackReason).toBe("protected-span");
  });

  it("rejects geometry that removes padded protected content", () => {
    const plan = solveSmartReframe({ width: 1600, height: 900, presetId: "instagram-classic", presetVersion: 1, ratio: [4, 5], strategy: "smart", analysis });
    expect(preservesProtectedExtendContent(plan, analysis)).toBe(true);
    expect(preservesProtectedExtendContent({ ...plan, sourceCrop: { ...plan.sourceCrop, x: 700 } }, analysis)).toBe(false);
  });

  it("preserves the complete source when requested", () => {
    const plan = solveSmartReframe({ width: 1600, height: 900, presetId: "story-reel", presetVersion: 1, ratio: [9, 16], strategy: "preserve-all", analysis });
    expect(plan.sourceCrop).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
    expect(plan.outputWidth / plan.outputHeight).toBe(9 / 16);
  });

  it("falls back to preserve-all when analysis confidence is low", () => {
    const plan = solveSmartReframe({ width: 900, height: 1600, presetId: "youtube-thumbnail", presetVersion: 1, ratio: [16, 9], strategy: "smart", analysis: { ...analysis, confidence: 0.4 } });
    expect(plan.strategy).toBe("preserve-all");
    expect(plan.warnings[0]).toMatch(/confidence/i);
  });
});
