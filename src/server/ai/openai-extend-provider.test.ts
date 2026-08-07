// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SmartReframePlan } from "@/shared/extend-plan";

const mocks = vi.hoisted(() => ({ edit: vi.fn(), toFile: vi.fn(async (value) => value) }));
vi.mock("openai", () => ({
  default: class MockOpenAI { static APIError = class APIError extends Error {}; images = { edit: mocks.edit }; },
  toFile: mocks.toFile,
}));

import { OpenAIExtendProvider } from "./extend-provider";

describe("OpenAI Extend provider", () => {
  beforeEach(() => mocks.edit.mockReset());

  it("always requests GPT Image at low quality and returns logical output dimensions", async () => {
    const source = await sharp({ create: { width: 100, height: 80, channels: 4, background: "blue" } }).png().toBuffer();
    const providerOutput = await sharp({ create: { width: 816, height: 816, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { data: [{ b64_json: providerOutput.toString("base64") }] }, request_id: "extend-openai" }) });
    const plan: SmartReframePlan = {
      schemaVersion: 1, strategy: "preserve-all", presetId: "instagram-square", presetVersion: 1, inputWidth: 100, inputHeight: 80,
      sourceCrop: { x: 0, y: 0, width: 100, height: 80 }, sourcePlacement: { x: 0, y: 10, width: 100, height: 80 }, outputWidth: 100, outputHeight: 100,
      expansionInsets: { top: 10, right: 0, bottom: 10, left: 0 }, seamWidth: 8, cropAreaRatio: 0, generatedAreaRatio: 0.2, confidence: 0.9, rationale: [], warnings: [],
    };
    const result = await new OpenAIExtendProvider("test-key").extend({ sourcePng: new Uint8Array(source), plan, instruction: "Continue the scene" });
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", quality: "low", size: "816x816", output_format: "png" }));
    expect(mocks.edit.mock.calls[0][0]).toHaveProperty("mask");
    expect(await sharp(result.candidatePng).metadata()).toMatchObject({ width: 100, height: 100 });
  });
});
