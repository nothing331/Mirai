import { describe, expect, it } from "vitest";
import { createMask } from "./mask";
import { cleanRasterMask, unionMasks } from "./mask-cleanup";

describe("raster mask cleanup", () => {
  it("closes a narrow gap without changing source dimensions", () => {
    const mask = createMask(7, 5);
    for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 5; x += 1) mask.data[y * 7 + x] = 255;
    mask.data[2 * 7 + 3] = 0;
    const cleaned = cleanRasterMask(mask, 1, 1);
    expect([cleaned.width, cleaned.height]).toEqual([7, 5]);
    expect(cleaned.data[2 * 7 + 3]).toBe(255);
  });

  it("removes disconnected islands below the configured area", () => {
    const mask = createMask(8, 4);
    mask.data[0] = 255;
    for (let y = 1; y <= 2; y += 1) for (let x = 4; x <= 6; x += 1) mask.data[y * 8 + x] = 255;
    const cleaned = cleanRasterMask(mask, 0, 2);
    expect(cleaned.data[0]).toBe(0);
    expect(cleaned.data[1 * 8 + 4]).toBe(255);
  });

  it("unions masks without mutating either input", () => {
    const base = createMask(2, 1);
    const addition = createMask(2, 1);
    base.data[0] = 255;
    addition.data[1] = 128;
    const union = unionMasks(base, addition);
    expect([...union.data]).toEqual([255, 128]);
    expect([...base.data]).toEqual([255, 0]);
    expect([...addition.data]).toEqual([0, 128]);
  });
});
