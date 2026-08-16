// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock("@/server/asset-generation/provider-factory", () => ({
  assetGenerationCapabilities: () => ({ provider: "fake", model: "fake-asset-generator", quality: "low", candidateCount: 1, markSize: { width: 1024, height: 1024 }, imageFormats: [{ id: "instagram-post", width: 1024, height: 1024 }, { id: "instagram-portrait", width: 1024, height: 1280 }, { id: "story-reel", width: 720, height: 1280 }, { id: "youtube-thumbnail", width: 1280, height: 720 }], nativeTransparency: false, maxBatchesPerSession: 2 }),
  createAssetGenerator: () => ({ generate: mocks.generate }),
}));
vi.mock("@/server/diagnostics/request-diagnostic-service", () => ({ startRequestDiagnostics: vi.fn().mockResolvedValue(null) }));

import { GET, POST } from "./route";

async function matteCandidate(shape: string, matte = "#00ff66") {
  return sharp({ create: { width: 128, height: 128, channels: 4, background: matte } })
    .composite([{ input: Buffer.from(`<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">${shape}</svg>`) }])
    .png().toBuffer();
}

async function completeCandidate(width: number, height: number, color = "#285fa8") {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
}

function request(body: unknown) {
  return new Request("http://localhost/api/asset-generations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-project-id": "generated-project", "x-request-id": "generation-1" },
    body: JSON.stringify(body),
  });
}

describe("asset generation route", () => {
  beforeEach(() => mocks.generate.mockReset());

  it("exposes one-result, low-quality capabilities and server-owned formats", async () => {
    expect(await (await GET()).json()).toMatchObject({ provider: "fake", candidateCount: 1, quality: "low", markSize: { width: 1024, height: 1024 }, imageFormats: [{ id: "instagram-post", width: 1024, height: 1024 }, { id: "instagram-portrait", width: 1024, height: 1280 }, { id: "story-reel", width: 720, height: 1280 }, { id: "youtube-thumbnail", width: 1280, height: 720 }], nativeTransparency: false });
  });

  it("generates and locally normalizes one transparent mark", async () => {
    mocks.generate.mockResolvedValue({ providerRequestId: "fake-provider-1", candidates: [{ ordinal: 0, png: await matteCandidate('<circle cx="64" cy="64" r="30" fill="#171714"/>', "#00d9ff") }] });
    const response = await POST(request({ mode: "mark", format: "square-mark", brief: { assetType: "logo-mark", description: "A precise orbital compass", style: "minimal-geometric", detail: "simple", colorMode: "custom", colors: ["#171714", "#d8f441"] } }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ projectId: "generated-project", requestId: "generation-1", mode: "mark", format: "square-mark", width: 1024, height: 1024, providerRequestId: "fake-provider-1", quality: "low", imageGenerationAttempted: true });
    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0]).toMatchObject({ width: 1024, height: 1024, transparency: { status: "clean" } });
    const first = await sharp(Buffer.from(payload.candidates[0].candidateBase64, "base64")).ensureAlpha().raw().toBuffer();
    expect(first[3]).toBe(0);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ mode: "mark", count: 1, width: 1024, height: 1024, quality: "low" }), undefined);
  });

  it("passes no fixed colors to the provider when mark palette mode is auto", async () => {
    mocks.generate.mockResolvedValue({ providerRequestId: "fake-provider-auto", candidates: [{ ordinal: 0, png: await matteCandidate('<circle cx="64" cy="64" r="30" fill="#171714"/>') }] });

    const response = await POST(request({ mode: "mark", format: "square-mark", brief: { assetType: "icon", description: "A friendly signal beacon", style: "flat", detail: "simple", colorMode: "auto", colors: [] } }));

    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ colors: [], matteColor: "#00ff66" }), undefined);
  });

  it("creates one treated portrait image without matte processing", async () => {
    mocks.generate.mockResolvedValue({ providerRequestId: "fake-image-1", candidates: [{ ordinal: 0, png: await completeCandidate(1024, 1280) }] });

    const response = await POST(request({ mode: "image", prompt: "Mount Everest at sunrise", treatment: "sketch", format: "instagram-portrait" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ mode: "image", format: "instagram-portrait", width: 1024, height: 1280, candidates: [{ width: 1024, height: 1280 }] });
    expect(payload.prompt).toContain("hand-drawn graphite sketch");
    expect(payload.prompt).toContain("Mount Everest at sunrise");
    expect(payload.candidates[0].transparency).toBeUndefined();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ mode: "image", width: 1024, height: 1280, matteColor: null }), undefined);
  });

  it("rejects transform requests and arbitrary dimensions before making a provider call", async () => {
    const response = await POST(request({ mode: "image", prompt: "A mountain", treatment: "sketch", format: "custom", width: 4000, height: 4000 }));
    expect(response.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ imageGenerationAttempted: false });

    const transformResponse = await POST(request({ mode: "transform", prompt: "Sketch this", source: "data" }));
    expect(transformResponse.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
