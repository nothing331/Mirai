// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageProviderError } from "./contracts";
import { FakeImageEditProvider } from "./fake-provider";

async function png(width: number, height: number, channels: [number, number, number, number]) {
  return sharp({ create: { width, height, channels: 4, background: { r: channels[0], g: channels[1], b: channels[2], alpha: channels[3] / 255 } } }).png().toBuffer();
}

describe("FakeImageEditProvider", () => {
  it.each(["remove", "restyle"] as const)("returns a normalized %s candidate", async (operation) => {
    const provider = new FakeImageEditProvider();
    const result = await provider.edit({ imagePng: await png(4, 3, [10, 20, 30, 255]), maskPng: await png(4, 3, [255, 255, 255, 255]), width: 4, height: 3, operation, boundaryPolicy: "review", prompt: operation === "restyle" ? "copper" : "" });
    const metadata = await sharp(result.candidatePng).metadata();
    expect([metadata.width, metadata.height]).toEqual([4, 3]);
    expect(result.providerRequestId).toMatch(/^fake-/);
  });

  it("marks temporary failures as retryable", async () => {
    const provider = new FakeImageEditProvider();
    const request = { imagePng: await png(1, 1, [0, 0, 0, 255]), maskPng: await png(1, 1, [255, 255, 255, 255]), width: 1, height: 1, operation: "remove" as const, boundaryPolicy: "review" as const, prompt: "", scenario: "retryable-error" as const };
    await expect(provider.edit(request)).rejects.toMatchObject({ retryable: true } satisfies Partial<ImageProviderError>);
  });

  it("marks permanent failures as non-retryable", async () => {
    const provider = new FakeImageEditProvider();
    const request = { imagePng: await png(1, 1, [0, 0, 0, 255]), maskPng: await png(1, 1, [255, 255, 255, 255]), width: 1, height: 1, operation: "remove" as const, boundaryPolicy: "review" as const, prompt: "", scenario: "fatal-error" as const };
    await expect(provider.edit(request)).rejects.toMatchObject({ retryable: false } satisfies Partial<ImageProviderError>);
  });

  it("requires a prompt for restyle", async () => {
    const provider = new FakeImageEditProvider();
    await expect(provider.edit({ imagePng: await png(1, 1, [0, 0, 0, 255]), maskPng: await png(1, 1, [255, 255, 255, 255]), width: 1, height: 1, operation: "restyle", boundaryPolicy: "review", prompt: "" })).rejects.toThrow(/Describe/);
  });

  it("transforms the complete image without a provider mask", async () => {
    const provider = new FakeImageEditProvider();
    const result = await provider.edit({ imagePng: await png(2, 2, [10, 20, 30, 255]), width: 2, height: 2, operation: "transform", boundaryPolicy: "review", prompt: "Render as ink" });
    expect(await sharp(result.candidatePng).metadata()).toMatchObject({ width: 2, height: 2 });
  });

  it("rejects maskless localized edits and masked transforms", async () => {
    const provider = new FakeImageEditProvider();
    const imagePng = await png(1, 1, [0, 0, 0, 255]);
    await expect(provider.edit({ imagePng, width: 1, height: 1, operation: "restyle", boundaryPolicy: "review", prompt: "copper" })).rejects.toThrow(/mask is required/i);
    await expect(provider.edit({ imagePng, maskPng: imagePng, width: 1, height: 1, operation: "transform", boundaryPolicy: "review", prompt: "ink" })).rejects.toThrow(/must not send/i);
  });
});
