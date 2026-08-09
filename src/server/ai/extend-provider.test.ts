// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FakeExtendProvider } from "./extend-provider";
import type { SmartReframePlan } from "@/shared/extend-plan";

describe("Extend provider normalization", () => {
  it("returns the complete provider candidate and a full-output effective mask", async () => {
    const source = await sharp({ create: { width: 100, height: 80, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 1 } } }).png().toBuffer();
    const plan: SmartReframePlan = {
      schemaVersion: 1, strategy: "preserve-all", presetId: "instagram-square", presetVersion: 1, inputWidth: 100, inputHeight: 80,
      sourceCrop: { x: 0, y: 0, width: 100, height: 80 }, sourcePlacement: { x: 0, y: 10, width: 100, height: 80 }, outputWidth: 100, outputHeight: 100,
      expansionInsets: { top: 10, right: 0, bottom: 10, left: 0 }, seamWidth: 8, cropAreaRatio: 0, generatedAreaRatio: 0.2, confidence: 0.9, rationale: [], warnings: [],
    };
    const result = await new FakeExtendProvider().extend({ sourcePng: new Uint8Array(source), plan, instruction: "extend" });
    const output = await sharp(result.candidatePng).raw().toBuffer({ resolveWithObject: true });
    expect(output.info).toMatchObject({ width: 100, height: 100 });
    const effectiveMask = await sharp(result.effectiveMaskPng).ensureAlpha().raw().toBuffer();
    expect(effectiveMask[((10 + 40) * 100 + 50) * 4 + 3]).toBe(255);
    expect(effectiveMask[(2 * 100 + 50) * 4 + 3]).toBe(255);
    expect(await sharp(result.rawCandidatePng).metadata()).toMatchObject({ width: 816, height: 816 });
  });
});
