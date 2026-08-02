// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FakeEditIntentPlanner } from "./fake-intent-planner";
import { buildPlannedContext, preparePlannerImages } from "./intent-planner";

async function sourceAndMask() {
  const width = 120;
  const height = 80;
  const imagePng = await sharp({ create: { width, height, channels: 4, background: "#49657a" } }).png().toBuffer();
  const maskPixels = Buffer.alloc(width * height * 4, 255);
  for (let index = 0; index < width * height; index += 1) maskPixels[index * 4 + 3] = 0;
  for (let y = 30; y < 50; y += 1) for (let x = 50; x < 75; x += 1) maskPixels[(y * width + x) * 4 + 3] = 255;
  const selectionMaskPng = await sharp(maskPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { imagePng, selectionMaskPng, width, height, prompt: "add an Indian flag" };
}

describe("edit intent planning", () => {
  it("creates bounded context images without changing the source mask", async () => {
    const request = await sourceAndMask();
    const before = Buffer.from(request.selectionMaskPng);
    const images = await preparePlannerImages(request);
    expect(request.selectionMaskPng).toEqual(before);
    expect(await sharp(images.contextPng).metadata()).toMatchObject({ width: 120, height: 80 });
    const detail = await sharp(images.detailPng).metadata();
    expect(detail.width).toBeLessThan(request.width);
    expect(detail.height).toBeLessThan(request.height);
  });

  it("interprets a short flag request as a flush surface graphic", async () => {
    const result = await new FakeEditIntentPlanner().plan(await sourceAndMask());
    expect(result.plan).toMatchObject({
      representation: "surface_graphic",
      confidence: "high",
    });
    expect(result.plan.exclusions).toEqual(expect.arrayContaining(["flagpole", "cloth"]));
    const instruction = buildPlannedContext(result.plan);
    expect(instruction).toContain("graphic applied flush to the selected surface");
    expect(instruction).toContain("flagpole");
  });
});
