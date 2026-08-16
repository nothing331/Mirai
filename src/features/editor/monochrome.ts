import type { ImageVersion } from "./types";

/** Converts an image to deterministic luminance while preserving dimensions and alpha. */
export function monochromePixels(input: Pick<ImageVersion, "pixels" | "width" | "height">): Uint8ClampedArray {
  if (input.pixels.length !== input.width * input.height * 4) throw new Error("Image pixel dimensions are invalid.");
  const output = new Uint8ClampedArray(input.pixels);
  for (let pixel = 0; pixel < output.length; pixel += 4) {
    const luminance = Math.round(output[pixel] * 0.2126 + output[pixel + 1] * 0.7152 + output[pixel + 2] * 0.0722);
    output[pixel] = luminance;
    output[pixel + 1] = luminance;
    output[pixel + 2] = luminance;
  }
  return output;
}
