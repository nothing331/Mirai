import { describe, expect, it } from "vitest";
import { createGenerativeEffectiveMask, createMask, deserializeMask, fillPolygonMask, getMaskBounds, paintMask, serializeMask } from "./mask";

describe("processing masks", () => {
  it("always uses source dimensions", () => {
    const mask = createMask(12, 7);
    expect(mask.data).toHaveLength(84);
    expect([mask.width, mask.height]).toEqual([12, 7]);
  });

  it("expands and feathers removal masks while leaving replacement masks unchanged", () => {
    const mask = createMask(21, 21);
    mask.data[10 * 21 + 10] = 255;
    const removal = createGenerativeEffectiveMask(mask, "remove");
    const replacement = createGenerativeEffectiveMask(mask, "replace");
    expect(removal.width).toBe(mask.width);
    expect(removal.data[10 * 21 + 12]).toBe(255);
    expect(removal.data.some((alpha) => alpha > 0 && alpha < 255)).toBe(true);
    expect(replacement.data).toEqual(mask.data);
    expect(removal.data).not.toBe(mask.data);
  });

  it("paints, erases, and clips strokes at image boundaries", () => {
    const mask = createMask(5, 5);
    const painted = paintMask(mask, { x: -1, y: -1 }, { x: 2, y: 2 }, 2, 255);
    expect(painted.data[0]).toBe(255);
    expect(painted.data[24]).toBe(0);
    const erased = paintMask(painted, { x: 0, y: 0 }, { x: 0, y: 0 }, 1, 0);
    expect(erased.data[0]).toBe(0);
    expect(mask.data.every((value) => value === 0)).toBe(true);
  });

  it("creates controlled partial alpha at feathered boundaries", () => {
    const painted = paintMask(createMask(7, 7), { x: 3, y: 3 }, { x: 3, y: 3 }, 3, 255, 0.5);
    expect(painted.data[3 * 7 + 3]).toBe(255);
    expect(painted.data[3 * 7 + 5]).toBeGreaterThan(0);
    expect(painted.data[3 * 7 + 5]).toBeLessThan(255);
  });

  it("round-trips a full-resolution mask through serialization", () => {
    const mask = paintMask(createMask(9, 4), { x: 2, y: 2 }, { x: 7, y: 2 }, 2, 255);
    const restored = deserializeMask(serializeMask(mask));
    expect([restored.width, restored.height]).toEqual([9, 4]);
    expect([...restored.data]).toEqual([...mask.data]);
  });

  it("fills the interior of a closed contour instead of selecting only its outline", () => {
    const mask = fillPolygonMask(createMask(10, 10), [
      { x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 },
    ], 0);
    expect(mask.data[5 * 10 + 5]).toBe(255);
    expect(mask.data[1 * 10 + 1]).toBe(0);
  });

  it("feathers inward from a closed contour boundary", () => {
    const mask = fillPolygonMask(createMask(12, 12), [
      { x: 1, y: 1 }, { x: 11, y: 1 }, { x: 11, y: 11 }, { x: 1, y: 11 },
    ], 3);
    expect(mask.data[1 * 12 + 5]).toBeGreaterThan(0);
    expect(mask.data[1 * 12 + 5]).toBeLessThan(255);
    expect(mask.data[6 * 12 + 6]).toBe(255);
  });

  it("finds source-space bounds for the active mask", () => {
    const mask = createMask(6, 5);
    mask.data[1 * 6 + 2] = 255;
    mask.data[3 * 6 + 4] = 255;
    expect(getMaskBounds(mask)).toEqual({ left: 2, top: 1, right: 4, bottom: 3, centerX: 3, centerY: 2 });
    expect(getMaskBounds(createMask(2, 2))).toBeNull();
  });
});
