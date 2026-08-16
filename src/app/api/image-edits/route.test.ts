// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageProviderError } from "@/server/ai/contracts";
import * as candidateAnalysis from "@/server/ai/candidate-analysis";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  transformPlan: vi.fn(),
  validateTransform: vi.fn(),
  edit: vi.fn(),
}));

vi.mock("@/server/ai/provider-factory", () => ({
  configuredPlannerModel: () => "fake-intent-planner",
  configuredProviderName: () => "fake",
  createEditIntentPlanner: () => ({ plan: mocks.plan }),
  createTransformPlanner: () => ({ plan: mocks.transformPlan }),
  createTransformValidator: () => ({ validate: mocks.validateTransform }),
  createImageEditProvider: () => ({ edit: mocks.edit }),
  parsePositiveInteger: (_value: string | undefined, fallback: number) => fallback,
}));

vi.mock("@/server/diagnostics/request-diagnostic-service", () => ({
  startRequestDiagnostics: vi.fn().mockResolvedValue(null),
}));

import { POST } from "./route";

async function request(operation: "replace" | "restyle" | "transform" = "replace") {
  const image = await sharp({ create: { width: 4, height: 3, channels: 4, background: "blue" } }).png().toBuffer();
  const mask = await sharp({ create: { width: 4, height: 3, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const form = new FormData();
  form.set("image", new File([Uint8Array.from(image)], "image.png", { type: "image/png" }));
  if (operation !== "transform") {
    form.set("selectionMask", new File([Uint8Array.from(mask)], "selection-mask.png", { type: "image/png" }));
    form.set("mask", new File([Uint8Array.from(mask)], "effective-mask.png", { type: "image/png" }));
  } else {
    form.set("presetId", "anime");
    form.set("presetVersion", "1");
    form.set("preservationMode", "balanced");
  }
  form.set("operation", operation);
  form.set("boundaryPolicy", "review");
  form.set("prompt", operation === "replace" ? "add an Indian flag" : operation === "transform" ? "warm evening light" : "brushed copper");
  form.set("scenario", "success");
  return new Request("http://localhost/api/image-edits", {
    method: "POST",
    headers: { "x-project-id": "project-1", "x-request-id": "request-1" },
    body: form,
  });
}

describe("image edit route orchestration", () => {
  beforeEach(() => {
    mocks.plan.mockReset();
    mocks.transformPlan.mockReset();
    mocks.validateTransform.mockReset();
    mocks.edit.mockReset();
    mocks.transformPlan.mockResolvedValue({ plan: transformPlan(), providerRequestId: "transform-planner-1" });
    mocks.validateTransform.mockResolvedValue({ assessment: passingAssessment(), providerRequestId: "transform-validator-1" });
  });

  it("plans Replace before starting the image editor", async () => {
    const candidatePng = await sharp({ create: { width: 4, height: 3, channels: 4, background: "red" } }).png().toBuffer();
    const plan = {
      target: "rocket fuselage",
      representation: "surface_graphic" as const,
      integration: "Paint the flag flush to the curved surface.",
      constraints: ["follow the surface curvature"],
      exclusions: ["flagpole", "cloth"],
      confidence: "high" as const,
      rationale: "A rocket flag is normally a marking.",
    };
    mocks.plan.mockResolvedValue({ plan, providerRequestId: "planner-1" });
    mocks.edit.mockResolvedValue({ candidatePng, providerRequestId: "image-1" });

    const response = await POST(await request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ plan, boundaryPolicy: "review" }), undefined);
    expect(mocks.plan.mock.invocationCallOrder[0]).toBeLessThan(mocks.edit.mock.invocationCallOrder[0]);
    expect(payload).toMatchObject({ providerRequestId: "image-1", imageGenerationAttempted: true, candidateAnalysis: { classification: "candidate-within-selection" } });
  });

  it("stops before image generation when planning fails", async () => {
    mocks.plan.mockRejectedValue(new ImageProviderError("planner unavailable", true));

    const response = await POST(await request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(payload).toMatchObject({ retryable: true, imageGenerationAttempted: false });
  });

  it("does not plan Restyle requests", async () => {
    const candidatePng = await sharp({ create: { width: 4, height: 3, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockResolvedValue({ candidatePng, providerRequestId: "image-2" });
    const response = await POST(await request("restyle"));
    expect(response.status).toBe(200);
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ operation: "restyle", plan: undefined }), undefined);
  });

  it("plans, generates, and validates a complete-image Transform without a provider mask", async () => {
    const candidatePng = await sharp({ create: { width: 4, height: 3, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockResolvedValue({ candidatePng, providerRequestId: "image-transform" });

    const response = await POST(await request("transform"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.transformPlan).toHaveBeenCalledTimes(1);
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({
      operation: "transform",
      boundaryPolicy: "review",
      prompt: expect.stringContaining("hand-drawn cinematic anime illustration"),
      plan: undefined,
      maskPng: undefined,
    }), undefined);
    expect(mocks.validateTransform).toHaveBeenCalledWith(expect.objectContaining({ preservationMode: "balanced", plan: transformPlan() }), undefined);
    expect(mocks.transformPlan.mock.invocationCallOrder[0]).toBeLessThan(mocks.edit.mock.invocationCallOrder[0]);
    expect(mocks.edit.mock.invocationCallOrder[0]).toBeLessThan(mocks.validateTransform.mock.invocationCallOrder[0]);
    expect(payload).toMatchObject({ providerRequestId: "image-transform", resolvedInstruction: expect.stringContaining("rocket"), transformFidelityAssessment: { verdict: "pass" } });
  });

  it("stops Transform before image generation when source planning fails", async () => {
    mocks.transformPlan.mockRejectedValue(new ImageProviderError("transform planner unavailable", true));

    const response = await POST(await request("transform"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.validateTransform).not.toHaveBeenCalled();
    expect(payload).toMatchObject({ retryable: true, imageGenerationAttempted: false });
  });

  it("preserves a Transform candidate but fails closed when semantic validation is unavailable", async () => {
    const candidatePng = await sharp({ create: { width: 4, height: 3, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockResolvedValue({ candidatePng, providerRequestId: "image-transform" });
    mocks.validateTransform.mockRejectedValue(new ImageProviderError("validator unavailable", true));

    const response = await POST(await request("transform"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(Buffer.from(payload.candidateBase64, "base64")).toEqual(candidatePng);
    expect(payload.transformFidelityAssessment).toMatchObject({ verdict: "block", validationAvailable: false });
  });

  it("preserves a valid provider proposal when candidate analysis fails", async () => {
    const candidatePng = await sharp({ create: { width: 4, height: 3, channels: 4, background: "red" } }).png().toBuffer();
    const analysisSpy = vi.spyOn(candidateAnalysis, "analyzeCandidate").mockRejectedValueOnce(new Error("analysis unavailable"));
    mocks.edit.mockResolvedValue({ candidatePng, providerRequestId: "image-3" });

    try {
      const response = await POST(await request("restyle"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(Buffer.from(payload.candidateBase64, "base64")).toEqual(candidatePng);
      expect(payload.candidateAnalysis).toMatchObject({
        classification: "analysis-unavailable",
        warnings: ["candidate-analysis-failed"],
      });
    } finally {
      analysisSpy.mockRestore();
    }
  });
});

function transformPlan() {
  return {
    sourceSummary: "A rocket launches through a blue sky",
    primarySubjects: [{ description: "rocket", count: 1, position: "diagonally across the frame", poseOrGeometry: "rising orientation", identityCues: ["engines"] }],
    composition: { framing: "landscape", cameraAngle: "low angle", spatialRelationships: ["exhaust trails behind"], backgroundStructure: ["blue sky"] },
    mustPreserve: ["rocket silhouette"],
    prohibitedChanges: ["unrelated subjects"],
    confidence: "high" as const,
  };
}

function passingAssessment() {
  return {
    verdict: "pass" as const,
    subjectPreservation: 1,
    compositionPreservation: 1,
    primarySubjectsMissing: [],
    unrelatedSubjectsAdded: [],
    compositionChanges: [],
    explanation: "Source semantics were retained.",
    confidence: "high" as const,
    validationAvailable: true,
  };
}
