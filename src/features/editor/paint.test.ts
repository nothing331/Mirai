import { describe, expect, it } from "vitest";
import { compositePaintOverlay, createPaintOverlay, paintOverlayMask, paintOverlayStroke } from "./paint";
import type { ImageVersion } from "./types";

const image: ImageVersion = {
  id: "input", parentVersionId: null, width: 3, height: 1, mediaType: "image/png",
  pixels: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255]), dataUrl: "data:image/png;base64,input",
};

describe("direct paint layer", () => {
  it("composites solid paint while preserving every untouched byte", () => {
    const overlay = paintOverlayStroke(createPaintOverlay(3, 1), [{ x: 0, y: 0 }], 0.6, 0, "#ff0000", false);
    const output = compositePaintOverlay(image, overlay);
    expect([...output.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...output.slice(4)]).toEqual([...image.pixels.slice(4)]);
  });

  it("allows later colors to paint over earlier pending strokes", () => {
    const red = paintOverlayStroke(createPaintOverlay(3, 1), [{ x: 1, y: 0 }], 0.6, 0, "#ff0000", false);
    const blue = paintOverlayStroke(red, [{ x: 1, y: 0 }], 0.6, 0, "#0000ff", false);
    expect([...blue.pixels.slice(4, 8)]).toEqual([0, 0, 255, 255]);
  });

  it("erases pending paint without changing the accepted input", () => {
    const painted = paintOverlayStroke(createPaintOverlay(3, 1), [{ x: 1, y: 0 }], 0.6, 0, "#ff0000", false);
    const erased = paintOverlayStroke(painted, [{ x: 1, y: 0 }], 0.6, 0, "#000000", true);
    expect(paintOverlayMask(erased).data.every((alpha) => alpha === 0)).toBe(true);
    expect([...compositePaintOverlay(image, erased)]).toEqual([...image.pixels]);
  });
});
