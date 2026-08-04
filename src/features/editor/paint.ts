import { createMask, paintMaskPath } from "./mask";
import { parseHexColor } from "./recolor";
import type { ImageVersion, PaintOverlay, ProcessingMask, SourcePoint } from "./types";

export function createPaintOverlay(width: number, height: number): PaintOverlay {
  return { width, height, pixels: new Uint8ClampedArray(width * height * 4) };
}

/** Adds or removes one complete gesture from the pending paint layer. */
export function paintOverlayStroke(overlay: PaintOverlay, points: SourcePoint[], radius: number, softness: number, color: string, erase: boolean): PaintOverlay {
  if (overlay.pixels.length !== overlay.width * overlay.height * 4) throw new Error("The paint layer dimensions are invalid.");
  const coverage = paintMaskPath(createMask(overlay.width, overlay.height), points, radius, 255, softness);
  const pixels = new Uint8ClampedArray(overlay.pixels);
  const [red, green, blue] = parseHexColor(color);
  for (let index = 0; index < coverage.data.length; index += 1) {
    const amount = coverage.data[index] / 255;
    if (amount === 0) continue;
    const pixel = index * 4;
    if (erase) {
      pixels[pixel + 3] = Math.round(pixels[pixel + 3] * (1 - amount));
      continue;
    }
    const destinationAlpha = pixels[pixel + 3] / 255;
    const outputAlpha = amount + destinationAlpha * (1 - amount);
    pixels[pixel] = outputAlpha === 0 ? 0 : Math.round((red * amount + pixels[pixel] * destinationAlpha * (1 - amount)) / outputAlpha);
    pixels[pixel + 1] = outputAlpha === 0 ? 0 : Math.round((green * amount + pixels[pixel + 1] * destinationAlpha * (1 - amount)) / outputAlpha);
    pixels[pixel + 2] = outputAlpha === 0 ? 0 : Math.round((blue * amount + pixels[pixel + 2] * destinationAlpha * (1 - amount)) / outputAlpha);
    pixels[pixel + 3] = Math.round(outputAlpha * 255);
  }
  return { ...overlay, pixels };
}

export function paintOverlayMask(overlay: PaintOverlay): ProcessingMask {
  const data = new Uint8ClampedArray(overlay.width * overlay.height);
  for (let index = 0; index < data.length; index += 1) data[index] = overlay.pixels[index * 4 + 3];
  return { width: overlay.width, height: overlay.height, data };
}

/** Composites pending paint without changing a single byte outside its alpha coverage. */
export function compositePaintOverlay(input: ImageVersion, overlay: PaintOverlay): Uint8ClampedArray {
  if (overlay.width !== input.width || overlay.height !== input.height || overlay.pixels.length !== input.pixels.length) throw new Error("The paint layer does not match the image dimensions.");
  const output = new Uint8ClampedArray(input.pixels);
  for (let pixel = 0; pixel < output.length; pixel += 4) {
    const sourceAlpha = overlay.pixels[pixel + 3] / 255;
    if (sourceAlpha === 0) continue;
    const destinationAlpha = input.pixels[pixel + 3] / 255;
    const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
    output[pixel] = Math.round((overlay.pixels[pixel] * sourceAlpha + input.pixels[pixel] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
    output[pixel + 1] = Math.round((overlay.pixels[pixel + 1] * sourceAlpha + input.pixels[pixel + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
    output[pixel + 2] = Math.round((overlay.pixels[pixel + 2] * sourceAlpha + input.pixels[pixel + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
    output[pixel + 3] = Math.round(outputAlpha * 255);
  }
  return output;
}
