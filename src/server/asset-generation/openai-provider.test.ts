// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    static APIError = class APIError extends Error {};
    images = { generate: mocks.generate };
  },
}));

import { OpenAIAssetGenerator } from "./openai-provider";

describe("OpenAIAssetGenerator", () => {
  beforeEach(() => { mocks.generate.mockReset(); });

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

  it("passes a server-approved flexible size through the generation endpoint", async () => {
    const output = Buffer.from("portrait-image");
    mocks.generate.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { data: [{ b64_json: output.toString("base64") }] }, request_id: "openai-image-1" }) });

    const result = await new OpenAIAssetGenerator("test-key", "gpt-image-2").generate({ mode: "image", prompt: "a graphite mountain", count: 1, width: 1024, height: 1280, quality: "low", matteColor: null, colors: [] });

    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", prompt: "a graphite mountain", n: 1, size: "1024x1280", quality: "low", output_format: "png" }));
    expect(Buffer.from(result.candidates[0].png)).toEqual(output);
  });
});
