// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FakeAssetGenerator } from "./fake-provider";

describe("FakeAssetGenerator", () => {
  it("returns one matte-backed 1024px mark candidate", async () => {
    const result = await new FakeAssetGenerator().generate({
      mode: "mark",
      prompt: "test",
      count: 1,
      width: 1024,
      height: 1024,
      quality: "low",
      matteColor: "#00ff66",
      colors: ["#171714", "#d8f441"],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.providerRequestId).toMatch(/^fake-asset-/);
    await Promise.all(result.candidates.map(async (candidate) => {
      const metadata = await sharp(candidate.png).metadata();
      expect([metadata.width, metadata.height]).toEqual([1024, 1024]);
    }));
  });

  it("creates a requested landscape image and transforms one source", async () => {
    const provider = new FakeAssetGenerator();
    const generated = await provider.generate({ mode: "image", prompt: "sunset", count: 1, width: 1536, height: 1024, quality: "low", matteColor: null, colors: [] });
    expect(await sharp(generated.candidates[0].png).metadata()).toMatchObject({ width: 1536, height: 1024 });

    const source = await sharp({ create: { width: 64, height: 96, channels: 4, background: "#2865b8" } }).png().toBuffer();
    const transformed = await provider.generate({ mode: "transform", prompt: "warm", count: 1, width: 1024, height: 1536, quality: "low", matteColor: null, colors: [], sourcePng: source });
    expect(await sharp(transformed.candidates[0].png).metadata()).toMatchObject({ width: 1024, height: 1536 });
  });
});
