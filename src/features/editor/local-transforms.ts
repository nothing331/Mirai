import type { CropRect, ImageVersion } from "./types";

export interface PixelResult {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

function assertVersion(version: ImageVersion) {
  if (version.width < 1 || version.height < 1 || version.pixels.length !== version.width * version.height * 4) {
    throw new Error("The image pixel dimensions are invalid.");
  }
}

export function cropPixels(version: ImageVersion, rect: CropRect): PixelResult {
  assertVersion(version);
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 1 || height < 1 || x < 0 || y < 0 || x + width > version.width || y + height > version.height) {
    throw new Error("The crop rectangle must stay inside the source image.");
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let outputY = 0; outputY < height; outputY += 1) {
    const sourceStart = ((y + outputY) * version.width + x) * 4;
    pixels.set(version.pixels.subarray(sourceStart, sourceStart + width * 4), outputY * width * 4);
  }
  return { width, height, pixels };
}

export function rotatePixels(version: ImageVersion, quarterTurns: 1 | 2 | 3): PixelResult {
  assertVersion(version);
  const width = quarterTurns === 2 ? version.width : version.height;
  const height = quarterTurns === 2 ? version.height : version.width;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < version.height; y += 1) {
    for (let x = 0; x < version.width; x += 1) {
      const source = (y * version.width + x) * 4;
      let outputX: number;
      let outputY: number;
      if (quarterTurns === 1) { outputX = version.height - 1 - y; outputY = x; }
      else if (quarterTurns === 2) { outputX = version.width - 1 - x; outputY = version.height - 1 - y; }
      else { outputX = y; outputY = version.width - 1 - x; }
      pixels.set(version.pixels.subarray(source, source + 4), (outputY * width + outputX) * 4);
    }
  }
  return { width, height, pixels };
}

export function flipPixels(version: ImageVersion, axis: "horizontal" | "vertical"): PixelResult {
  assertVersion(version);
  const pixels = new Uint8ClampedArray(version.pixels.length);
  for (let y = 0; y < version.height; y += 1) {
    for (let x = 0; x < version.width; x += 1) {
      const outputX = axis === "horizontal" ? version.width - 1 - x : x;
      const outputY = axis === "vertical" ? version.height - 1 - y : y;
      const source = (y * version.width + x) * 4;
      pixels.set(version.pixels.subarray(source, source + 4), (outputY * version.width + outputX) * 4);
    }
  }
  return { width: version.width, height: version.height, pixels };
}

/** Deterministic bilinear resize so accepted pixels do not depend on browser canvas interpolation. */
export function resizePixels(version: ImageVersion, requestedWidth: number, requestedHeight: number): PixelResult {
  assertVersion(version);
  const width = Math.round(requestedWidth);
  const height = Math.round(requestedHeight);
  if (width < 1 || height < 1 || width * height > 40_000_000) throw new Error("Choose dimensions between 1 pixel and 40 megapixels.");
  const pixels = new Uint8ClampedArray(width * height * 4);
  const scaleX = version.width / width;
  const scaleY = version.height / height;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.max(0, Math.min(version.height - 1, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(version.height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.max(0, Math.min(version.width - 1, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(version.width - 1, x0 + 1);
      const fx = sourceX - x0;
      const output = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = version.pixels[(y0 * version.width + x0) * 4 + channel] * (1 - fx) + version.pixels[(y0 * version.width + x1) * 4 + channel] * fx;
        const bottom = version.pixels[(y1 * version.width + x0) * 4 + channel] * (1 - fx) + version.pixels[(y1 * version.width + x1) * 4 + channel] * fx;
        pixels[output + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width, height, pixels };
}
