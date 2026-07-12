import { describe, expect, it } from "vitest";
import { compositeCandidate } from "./composite";
import { createMask } from "./mask";

describe("compositeCandidate", () => {
  it("restores every unselected RGBA byte exactly", () => {
    const input = new Uint8ClampedArray([1, 2, 3, 4, 10, 20, 30, 40]);
    const candidate = new Uint8ClampedArray([255, 255, 255, 255, 90, 100, 110, 120]);
    const mask = createMask(2, 1);
    mask.data[1] = 255;
    expect([...compositeCandidate(input, candidate, mask)]).toEqual([1, 2, 3, 4, 90, 100, 110, 120]);
  });

  it("blends controlled partial boundaries", () => {
    const mask = createMask(1, 1);
    mask.data[0] = 128;
    expect([...compositeCandidate(new Uint8ClampedArray([0, 20, 40, 60]), new Uint8ClampedArray([100, 120, 140, 160]), mask)]).toEqual([50, 70, 90, 110]);
  });

  it("rejects dimension mismatches", () => {
    expect(() => compositeCandidate(new Uint8ClampedArray(4), new Uint8ClampedArray(8), createMask(1, 1))).toThrow(/dimensions/);
  });
});
