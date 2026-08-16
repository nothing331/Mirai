// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeAssetCandidate } from "./candidate-normalizer";

describe("asset candidate normalizer", () => {
  it("removes only edge-connected matte pixels and keeps enclosed foreground opaque", async () => {
    const input = await sharp({ create: { width: 128, height: 128, channels: 4, background: "#00ff66" } })
      .composite([{ input: Buffer.from('<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><circle cx="64" cy="64" r="35" fill="#171714"/><circle cx="64" cy="64" r="9" fill="#00ff66"/></svg>') }])
      .png()
      .toBuffer();
    const result = await normalizeAssetCandidate(input, "#00ff66");
    const pixels = await sharp(result.png).raw().toBuffer();
    const alpha = (x: number, y: number) => pixels[(y * 1024 + x) * 4 + 3];

    expect([result.width, result.height]).toEqual([1024, 1024]);
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(512, 512)).toBe(255);
    expect(alpha(512, 300)).toBeGreaterThan(200);
    expect(result.transparency).toMatchObject({ status: "clean", confidence: 1 });
  });

  it("flags a candidate whose border does not match the requested matte", async () => {
    const input = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#ffffff" } }).png().toBuffer();
    const result = await normalizeAssetCandidate(input, "#00ff66");
    expect(result.transparency.status).toBe("failed");
  });
});
