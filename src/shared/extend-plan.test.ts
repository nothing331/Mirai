import { describe, expect, it } from "vitest";
import { solveSmartReframe, type ExtendSceneAnalysis } from "./extend-plan";

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
