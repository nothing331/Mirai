// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageProviderError } from "@/server/ai/contracts";
import * as candidateAnalysis from "@/server/ai/candidate-analysis";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  edit: vi.fn(),
}));

vi.mock("@/server/ai/provider-factory", () => ({
  configuredPlannerModel: () => "fake-intent-planner",
  configuredProviderName: () => "fake",
  createEditIntentPlanner: () => ({ plan: mocks.plan }),
  createImageEditProvider: () => ({ edit: mocks.edit }),
  parsePositiveInteger: (_value: string | undefined, fallback: number) => fallback,
}));

vi.mock("@/server/diagnostics/request-diagnostic-service", () => ({
  startRequestDiagnostics: vi.fn().mockResolvedValue(null),
}));

import { POST } from "./route";

async function request(operation: "replace" | "restyle" = "replace") {
  const image = await sharp({ create: { width: 4, height: 3, channels: 4, background: "blue" } }).png().toBuffer();
  const mask = await sharp({ create: { width: 4, height: 3, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const form = new FormData();
  form.set("image", new File([Uint8Array.from(image)], "image.png", { type: "image/png" }));
  form.set("selectionMask", new File([Uint8Array.from(mask)], "selection-mask.png", { type: "image/png" }));
  form.set("mask", new File([Uint8Array.from(mask)], "effective-mask.png", { type: "image/png" }));
  form.set("operation", operation);
  form.set("boundaryPolicy", "review");
  form.set("prompt", operation === "replace" ? "add an Indian flag" : "brushed copper");
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
    mocks.edit.mockReset();
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
