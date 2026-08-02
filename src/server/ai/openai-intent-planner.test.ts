// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    static APIError = class APIError extends Error {};
    responses = { parse: mocks.parse };
  },
}));

import { OpenAIEditIntentPlanner } from "./openai-intent-planner";

async function plannerRequest() {
  const width = 8;
  const height = 6;
  const imagePng = await sharp({ create: { width, height, channels: 4, background: "blue" } }).png().toBuffer();
  const selectionMaskPng = await sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  return { imagePng, selectionMaskPng, width, height, prompt: "add an Indian flag" };
}

describe("OpenAIEditIntentPlanner", () => {
  beforeEach(() => mocks.parse.mockReset());

  it("uses multimodal Responses structured output and returns the provider request ID", async () => {
    const plan = {
      target: "rocket fuselage",
      representation: "surface_graphic" as const,
      integration: "Paint it flush to the curved fuselage.",
      constraints: ["follow the surface curvature"],
      exclusions: ["flagpole", "cloth"],
      confidence: "high" as const,
      rationale: "A rocket flag is a painted marking.",
    };
    mocks.parse.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({
      data: { id: "response-1", model: "gpt-5-nano-2025-08-07", status: "completed", output_parsed: plan, usage: { input_tokens: 42, output_tokens: 18 } },
      request_id: "planner-request-1",
    }) });

    const result = await new OpenAIEditIntentPlanner("test-key").plan(await plannerRequest());

    expect(result).toEqual({ plan, providerRequestId: "planner-request-1" });
    expect(mocks.parse).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5-nano-2025-08-07",
      store: false,
      reasoning: { effort: "low" },
      text: { format: expect.any(Object) },
    }));
    const content = mocks.parse.mock.calls[0][0].input[0].content;
    expect(content.filter((item: { type: string }) => item.type === "input_image")).toHaveLength(2);
  });
});
