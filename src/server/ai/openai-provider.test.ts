// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ edit: vi.fn(), toFile: vi.fn(async (value) => value) }));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    static APIError = class APIError extends Error {};
    images = { edit: mocks.edit };
  },
  toFile: mocks.toFile,
}));

import { buildEditInstruction, OpenAIImageEditProvider, supportsInputFidelity } from "./openai-provider";

describe("OpenAIImageEditProvider", () => {
  beforeEach(() => mocks.edit.mockReset());

  it("keeps SDK input and output inside the adapter and normalizes dimensions", async () => {
    const input = await sharp({ create: { width: 2, height: 3, channels: 4, background: "blue" } }).png().toBuffer();
    const mask = await sharp({ create: { width: 2, height: 3, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const providerOutput = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { created: 1, data: [{ b64_json: providerOutput.toString("base64") }] }, request_id: "openai-request-1" }) });
    const result = await new OpenAIImageEditProvider("test-key", "gpt-image-2", "medium", 2).edit({ imagePng: input, maskPng: mask, width: 2, height: 3, operation: "remove", prompt: "" });
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", size: "auto", quality: "medium", output_format: "png" }));
    expect(mocks.edit.mock.calls[0][0]).not.toHaveProperty("input_fidelity");
    const providerInput = mocks.edit.mock.calls[0][0].image as Uint8Array;
    expect(await sharp(providerInput).metadata()).toMatchObject({ width: 1, height: 2 });
    expect(await sharp(result.candidatePng).metadata()).toMatchObject({ width: 2, height: 3 });
    expect(result.providerRequestId).toBe("openai-request-1");
  });

  it("sends input fidelity only to model families that support it", async () => {
    const input = await sharp({ create: { width: 2, height: 2, channels: 4, background: "blue" } }).png().toBuffer();
    const mask = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    mocks.edit.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { created: 1, data: [{ b64_json: input.toString("base64") }] }, request_id: "openai-request-2" }) });
    await new OpenAIImageEditProvider("test-key", "gpt-image-1").edit({ imagePng: input, maskPng: mask, width: 2, height: 2, operation: "remove", prompt: "" });
    expect(mocks.edit.mock.calls[0][0]).toHaveProperty("input_fidelity", "high");
    expect(supportsInputFidelity("gpt-image-1-mini")).toBe(false);
    expect(supportsInputFidelity("gpt-image-2-2026-04-21")).toBe(false);
  });

  it("treats replacements as placement envelopes and removals as reconstruction", () => {
    const selection = { leftPercent: 10, topPercent: 50, widthPercent: 35, heightPercent: 30, touchesImageEdge: true };
    const replacement = buildEditInstruction("replace", "add a car", selection);
    expect(replacement).toContain("placement envelope, not as a crop");
    expect(replacement).toContain("entire requested subject must be visible");
    expect(replacement).toContain("scale and position the requested subject away from that edge");
    const removal = buildEditInstruction("remove", "", selection);
    expect(removal).toContain("Do not leave a blur, smudge, repeated texture, halo, outline, patch, or ghost");
  });
});
