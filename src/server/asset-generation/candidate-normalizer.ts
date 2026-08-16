import sharp from "sharp";
import type { AssetTransparencyStatus } from "@/shared/asset-generation";

export interface NormalizedAssetCandidate {
  png: Uint8Array;
  width: number;
  height: number;
  transparency: { status: AssetTransparencyStatus; confidence: number; foregroundRatio: number };
}

const backgroundDistance = 82;
const edgeFeatherDistance = 130;

/** Removes only matte-colored pixels connected to the canvas edge, preserving enclosed foreground detail. */
export async function normalizeAssetCandidate(input: Uint8Array, matteColor: string): Promise<NormalizedAssetCandidate> {
  const target = hexToRgb(matteColor);
  const { data, info } = await sharp(input).resize(1024, 1024, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  const total = info.width * info.height;
  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (background[index] || colorDistance(pixels, index, target) > backgroundDistance) return;
    background[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < info.width) enqueue(index + 1);
    if (y > 0) enqueue(index - info.width);
    if (y + 1 < info.height) enqueue(index + info.width);
  }

  let foregroundPixels = 0;
  for (let index = 0; index < total; index += 1) {
    const alphaIndex = index * 4 + 3;
    if (background[index]) {
      pixels[alphaIndex] = 0;
      continue;
    }
    foregroundPixels += 1;
    if (!touchesBackground(background, index, info.width, info.height)) continue;
    const distance = colorDistance(pixels, index, target);
    if (distance < edgeFeatherDistance) pixels[alphaIndex] = Math.max(24, Math.min(255, Math.round(((distance - backgroundDistance) / (edgeFeatherDistance - backgroundDistance)) * 255)));
  }

  const borderTotal = info.width * 2 + Math.max(0, info.height - 2) * 2;
  let matchedBorderPixels = 0;
  for (let x = 0; x < info.width; x += 1) {
    matchedBorderPixels += background[x] + background[(info.height - 1) * info.width + x];
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    matchedBorderPixels += background[y * info.width] + background[y * info.width + info.width - 1];
  }
  const borderConfidence = borderTotal === 0 ? 0 : matchedBorderPixels / borderTotal;
  const foregroundRatio = foregroundPixels / total;
  const coverageHealthy = foregroundRatio >= 0.03 && foregroundRatio <= 0.8;
  const confidence = Math.max(0, Math.min(1, borderConfidence * (coverageHealthy ? 1 : 0.45)));
  const status: AssetTransparencyStatus = confidence >= 0.9 ? "clean" : confidence >= 0.72 ? "warning" : "failed";
  const png = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { png: new Uint8Array(png), width: info.width, height: info.height, transparency: { status, confidence, foregroundRatio } };
}

function touchesBackground(background: Uint8Array, index: number, width: number, height: number): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  return (x > 0 && background[index - 1] === 1)
    || (x + 1 < width && background[index + 1] === 1)
    || (y > 0 && background[index - width] === 1)
    || (y + 1 < height && background[index + width] === 1);
}

function colorDistance(pixels: Uint8ClampedArray, index: number, target: [number, number, number]): number {
  const offset = index * 4;
  return Math.hypot(pixels[offset] - target[0], pixels[offset + 1] - target[1], pixels[offset + 2] - target[2]);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}
