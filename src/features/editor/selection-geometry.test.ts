import { describe, expect, it } from "vitest";
import { cleanLassoContour, countSelfIntersections, polygonArea, removeContourSpikes, simplifyClosedContour } from "./selection-geometry";

describe("lasso geometry cleanup", () => {
  it("simplifies hand jitter while keeping the selected area stable", () => {
    const noisyRectangle = [
      { x: 1, y: 1 }, { x: 3, y: 1.2 }, { x: 5, y: 0.9 }, { x: 8, y: 1 },
      { x: 8.1, y: 3 }, { x: 7.9, y: 5 }, { x: 8, y: 8 },
      { x: 5, y: 8.1 }, { x: 3, y: 7.9 }, { x: 1, y: 8 },
      { x: 0.9, y: 5 }, { x: 1.1, y: 3 },
    ];
    const result = cleanLassoContour(noisyRectangle, 2);
    expect(result.points.length).toBeLessThan(noisyRectangle.length);
    expect(Math.abs(polygonArea(result.points) - polygonArea(noisyRectangle)) / polygonArea(noisyRectangle)).toBeLessThan(0.1);
    expect(result.usedRawContour).toBe(false);
  });

  it("preserves intentional rectangular corners", () => {
    const rectangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(simplifyClosedContour(rectangle, 3)).toEqual(rectangle);
  });

  it("removes a short accidental spike", () => {
    const result = removeContourSpikes([
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5.4, y: -0.6 }, { x: 6, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ], 2);
    expect(result.removedCount).toBe(1);
    expect(result.points).not.toContainEqual({ x: 5.4, y: -0.6 });
  });

  it("detects a self-intersecting contour and preserves the raw input", () => {
    const crossed = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }];
    expect(countSelfIntersections(crossed)).toBe(1);
    expect(cleanLassoContour(crossed).usedRawContour).toBe(true);
  });
});
