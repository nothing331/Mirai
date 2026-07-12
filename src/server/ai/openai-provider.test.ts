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

import { OpenAIImageEditProvider } from "./openai-provider";

describe("OpenAIImageEditProvider", () => {
  beforeEach(() => mocks.edit.mockReset());

  it("keeps SDK input and output inside the adapter and normalizes dimensions", async () => {
    const input = await sharp({ create: { width: 2, height: 3, channels: 4, background: "blue" } }).png().toBuffer();
    const mask = await sharp({ create: { width: 2, height: 3, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const providerOutput = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockResolvedValue({ data: [{ b64_json: providerOutput.toString("base64") }] });
    const result = await new OpenAIImageEditProvider("test-key", "gpt-image-2", "medium", 2).edit({ imagePng: input, maskPng: mask, width: 2, height: 3, operation: "remove", prompt: "" });
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", size: "auto", quality: "medium", output_format: "png" }));
    expect(mocks.edit.mock.calls[0][0]).not.toHaveProperty("input_fidelity");
    const providerInput = mocks.edit.mock.calls[0][0].image as Uint8Array;
    expect(await sharp(providerInput).metadata()).toMatchObject({ width: 1, height: 2 });
    expect(await sharp(result.candidatePng).metadata()).toMatchObject({ width: 2, height: 3 });
    expect(result.providerRequestId).toMatch(/^openai-/);
  });
});
