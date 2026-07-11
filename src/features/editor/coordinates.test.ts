import { describe, expect, it } from "vitest";
import { displayToSource, fitViewport } from "./coordinates";

describe("displayToSource", () => {
  it("converts points through pan and zoom", () => {
    expect(displayToSource({ x: 110, y: 70 }, { x: 10, y: 20, scale: 2 })).toEqual({ x: 50, y: 25 });
    expect(displayToSource({ x: -5, y: 11 }, { x: -10, y: 1, scale: 0.5 })).toEqual({ x: 10, y: 20 });
  });

  it("fits and centers an image without upscaling", () => {
    expect(fitViewport(500, 500, 1000, 500)).toEqual({ x: 0, y: 125, scale: 0.5 });
    expect(fitViewport(500, 500, 100, 100)).toEqual({ x: 200, y: 200, scale: 1 });
  });
});
