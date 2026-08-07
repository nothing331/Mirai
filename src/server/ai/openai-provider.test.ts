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

import { buildEditInstruction, OpenAIImageEditProvider, resolveTransformOutputSize, supportsInputFidelity } from "./openai-provider";

describe("OpenAIImageEditProvider", () => {
  beforeEach(() => mocks.edit.mockReset());

  it("keeps SDK input and output inside the adapter and normalizes dimensions", async () => {
    const input = await sharp({ create: { width: 2, height: 3, channels: 4, background: "blue" } }).png().toBuffer();
    const mask = await sharp({ create: { width: 2, height: 3, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const providerOutput = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { created: 1, data: [{ b64_json: providerOutput.toString("base64") }] }, request_id: "openai-request-1" }) });
    const result = await new OpenAIImageEditProvider("test-key", "gpt-image-2", "medium", 2).edit({ imagePng: input, maskPng: mask, width: 2, height: 3, operation: "remove", boundaryPolicy: "review", prompt: "" });
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
    await new OpenAIImageEditProvider("test-key", "gpt-image-1").edit({ imagePng: input, maskPng: mask, width: 2, height: 2, operation: "remove", boundaryPolicy: "review", prompt: "" });
    expect(mocks.edit.mock.calls[0][0]).toHaveProperty("input_fidelity", "high");
    expect(supportsInputFidelity("gpt-image-1-mini")).toBe(false);
    expect(supportsInputFidelity("gpt-image-2-2026-04-21")).toBe(false);
  });

  it("omits the mask and requests an explicit source-aligned size for Transform", async () => {
    const input = await sharp({ create: { width: 16, height: 10, channels: 4, background: "blue" } }).png().toBuffer();
    const providerOutput = await sharp({ create: { width: 1024, height: 640, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { created: 1, data: [{ b64_json: providerOutput.toString("base64") }] }, request_id: "openai-transform" }) });

    await new OpenAIImageEditProvider("test-key", "gpt-image-2", "medium", 1024).edit({ imagePng: input, width: 16, height: 10, operation: "transform", boundaryPolicy: "review", prompt: "Render as ink" });

    expect(mocks.edit.mock.calls[0][0]).not.toHaveProperty("mask");
    expect(mocks.edit.mock.calls[0][0]).toHaveProperty("size", "1024x640");
  });

  it("rejects a materially incorrect Transform output aspect ratio instead of stretching it", async () => {
    const input = await sharp({ create: { width: 16, height: 10, channels: 4, background: "blue" } }).png().toBuffer();
    const providerOutput = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "red" } }).png().toBuffer();
    mocks.edit.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { created: 1, data: [{ b64_json: providerOutput.toString("base64") }] }, request_id: "wrong-aspect" }) });

    await expect(new OpenAIImageEditProvider("test-key", "gpt-image-2", "medium", 1024).edit({ imagePng: input, width: 16, height: 10, operation: "transform", boundaryPolicy: "review", prompt: "Render as ink" })).rejects.toThrow(/does not preserve/);
  });

  it("derives aligned output sizes without changing the configured input edge", () => {
    expect(resolveTransformOutputSize(1024, 640)).toBe("1024x640");
    expect(resolveTransformOutputSize(640, 1024)).toBe("640x1024");
    expect(() => resolveTransformOutputSize(4000, 1000)).toThrow(/between 1:3 and 3:1/);
  });

  it("turns a surface-graphic plan into contextual replacement constraints", () => {
    const selection = { leftPercent: 10, topPercent: 50, widthPercent: 35, heightPercent: 30, touchesImageEdge: true };
    const replacement = buildEditInstruction("replace", "add an Indian flag", selection, "review", {
      target: "rocket fuselage",
      representation: "surface_graphic",
      integration: "Follow the fuselage curvature and painted surface.",
      constraints: ["keep the graphic flush to the rocket"],
      exclusions: ["flagpole", "cloth"],
      confidence: "high",
      rationale: "A flag on a rocket is normally a marking.",
    });
    expect(replacement).toContain("approximate indication of intent, not as a clipping boundary");
    expect(replacement).toContain("graphic applied flush to the selected surface");
    expect(replacement).toContain("Preserve similar-looking and same-category subjects outside that focus");
    expect(replacement).toContain("Do not add or depict: flagpole; cloth");
    expect(replacement).toContain("avoid accidental cropping");
    const removal = buildEditInstruction("remove", "", selection, "protected");
    expect(removal).toContain("Do not leave a blur, smudge, repeated texture, halo, outline, patch, or ghost");
    expect(removal).toContain("strict edit boundary");
    expect(buildEditInstruction("transform", "Transform the complete image as graphite.", selection, "review")).toBe("Transform the complete image as graphite.");
  });
});
