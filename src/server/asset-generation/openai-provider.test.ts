// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), edit: vi.fn() }));
vi.mock("openai", () => ({
  toFile: vi.fn(async (input) => input),
  default: class MockOpenAI {
    static APIError = class APIError extends Error {};
    images = { generate: mocks.generate, edit: mocks.edit };
  },
}));

import { OpenAIAssetGenerator } from "./openai-provider";

describe("OpenAIAssetGenerator", () => {
  beforeEach(() => { mocks.generate.mockReset(); mocks.edit.mockReset(); });

  it("requests one low-quality image and decodes its PNG", async () => {
    const first = Buffer.from("candidate-one");
    mocks.generate.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({
      data: { created: 1, data: [{ b64_json: first.toString("base64") }] },
      request_id: "openai-generation-1",
    }) });
    const result = await new OpenAIAssetGenerator("test-key", "gpt-image-2").generate({
      mode: "mark",
      prompt: "a strict symbol prompt",
      count: 1,
      width: 1024,
      height: 1024,
      quality: "low",
      matteColor: "#00d9ff",
      colors: ["#171714"],
    });

    expect(mocks.generate).toHaveBeenCalledWith({ model: "gpt-image-2", prompt: "a strict symbol prompt", n: 1, size: "1024x1024", quality: "low", output_format: "png" });
    expect(result.providerRequestId).toBe("openai-generation-1");
    expect(Buffer.from(result.candidates[0].png)).toEqual(first);
  });

  it("uses the image edit endpoint for a transformation", async () => {
    const source = Buffer.from("source-image");
    const output = Buffer.from("transformed-image");
    mocks.edit.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { data: [{ b64_json: output.toString("base64") }] }, request_id: "openai-transform-1" }) });
    const provider = new OpenAIAssetGenerator("test-key", "gpt-image-2");

    const result = await provider.generate({ mode: "transform", prompt: "make it warmer", count: 1, width: 1536, height: 1024, quality: "low", matteColor: null, colors: [], sourcePng: source });

    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", prompt: "make it warmer", n: 1, size: "1536x1024", quality: "low", output_format: "png" }));
    expect(Buffer.from(result.candidates[0].png)).toEqual(output);
  });
});
