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

import { OpenAITransformPlanner } from "./openai-transform-planner";
import { OpenAITransformValidator } from "./openai-transform-validator";

describe("OpenAI Transform fidelity adapters", () => {
  beforeEach(() => mocks.parse.mockReset());

  it("plans source content from the complete input image", async () => {
    const imagePng = await image("blue");
    const plan = sourcePlan();
    mocks.parse.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({
      data: { id: "response-plan", model: "planner-model", status: "completed", usage: {}, output_parsed: plan },
      request_id: "planner-request",
    }) });

    const result = await new OpenAITransformPlanner("test-key", "planner-model").plan({ imagePng, width: 16, height: 10 });

    expect(result).toMatchObject({ plan, providerRequestId: "planner-request" });
    const input = mocks.parse.mock.calls[0][0].input[0].content;
    expect(input).toEqual(expect.arrayContaining([expect.objectContaining({ type: "input_image", detail: "high" })]));
    expect(input[0].text).toContain("Do not choose an artistic style");
  });

  it("compares source and candidate semantics after generation", async () => {
    const assessment = {
      verdict: "block" as const,
      subjectPreservation: 0,
      compositionPreservation: 0.1,
      primarySubjectsMissing: ["rocket"],
      unrelatedSubjectsAdded: ["person"],
      compositionChanges: ["launch scene replaced by rooftop"],
      explanation: "The primary subject and scene were replaced.",
      confidence: "high" as const,
      validationAvailable: true,
    };
    mocks.parse.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({
      data: { id: "response-validator", model: "validator-model", status: "completed", usage: {}, output_parsed: assessment },
      request_id: "validator-request",
    }) });

    const result = await new OpenAITransformValidator("test-key", "validator-model").validate({
      sourcePng: await image("blue"),
      candidatePng: await image("red"),
      width: 16,
      height: 10,
      plan: sourcePlan(),
      preservationMode: "faithful",
      changedPixelRatio: 0.999,
    });

    expect(result).toMatchObject({ assessment: { verdict: "block", primarySubjectsMissing: ["rocket"], validationAvailable: true }, providerRequestId: "validator-request" });
    const input = mocks.parse.mock.calls[0][0].input[0].content;
    expect(input.filter((item: { type: string }) => item.type === "input_image")).toHaveLength(2);
    expect(input[0].text).toContain("Evaluate semantic fidelity, not pixel similarity");
    expect(input[0].text).toContain("99.9% of pixels changed");
  });
});

function sourcePlan() {
  return {
    sourceSummary: "A rocket launches through a blue sky",
    primarySubjects: [{ description: "rocket", count: 1, position: "diagonal", poseOrGeometry: "rising", identityCues: ["engines"] }],
    composition: { framing: "landscape", cameraAngle: "low", spatialRelationships: ["exhaust behind rocket"], backgroundStructure: ["blue sky"] },
    mustPreserve: ["rocket"],
    prohibitedChanges: ["unrelated subjects"],
    confidence: "high" as const,
  };
}

function image(background: string) {
  return sharp({ create: { width: 16, height: 10, channels: 4, background } }).png().toBuffer();
}
