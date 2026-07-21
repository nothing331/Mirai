import type { ProcessingMask, SerializedProcessingMask, SourcePoint } from "./types";

export interface MaskBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/** Allocates an empty source-resolution alpha mask. */
export function createMask(width: number, height: number): ProcessingMask {
  return { width, height, data: new Uint8ClampedArray(width * height) };
}

/** Rasterizes a continuous circular brush segment while clipping to image bounds. */
export function paintMask(
  mask: ProcessingMask,
  from: SourcePoint,
  to: SourcePoint,
  radius: number,
  value: 0 | 255,
  softness = 0.2,
): ProcessingMask {
  const data = new Uint8ClampedArray(mask.data);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));

  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const cx = from.x + (to.x - from.x) * progress;
    const cy = from.y + (to.y - from.y) * progress;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(mask.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(mask.height - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distanceFromCenter = Math.hypot(x - cx, y - cy);
        if (distanceFromCenter > radius) continue;
        const featherWidth = Math.max(0.0001, radius * Math.min(1, Math.max(0, softness)));
        const innerRadius = radius - featherWidth;
        const coverage = distanceFromCenter <= innerRadius ? 255 : Math.round(255 * (radius - distanceFromCenter) / featherWidth);
        const index = y * mask.width + x;
        data[index] = value === 255 ? Math.max(data[index], coverage) : Math.min(data[index], 255 - coverage);
      }
    }
  }

  return { ...mask, data };
}

/** Fills the interior of a closed source-space contour and unions it into the mask. */
export function fillPolygonMask(mask: ProcessingMask, points: SourcePoint[], softness: number): ProcessingMask {
  if (points.length < 3) throw new Error("Draw a closed shape with at least three points.");
  const data = new Uint8ClampedArray(mask.data);
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const maxX = Math.min(mask.width - 1, Math.ceil(Math.max(...points.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(mask.height - 1, Math.ceil(Math.max(...points.map((point) => point.y))));
  const featherPixels = Math.max(0, softness);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const sample = { x: x + 0.5, y: y + 0.5 };
      if (!isPointInsidePolygon(sample, points)) continue;
      const edgeDistance = featherPixels === 0 ? featherPixels : distanceToPolygon(sample, points);
      const alpha = featherPixels === 0 ? 255 : Math.min(255, Math.round(255 * edgeDistance / featherPixels));
      const index = y * mask.width + x;
      data[index] = Math.max(data[index], alpha);
    }
  }
  return { ...mask, data };
}

/** Uses an even-odd ray test to classify one source-pixel center. */
function isPointInsidePolygon(point: SourcePoint, polygon: SourcePoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Finds the shortest source-space distance between a point and the contour edges. */
function distanceToPolygon(point: SourcePoint, polygon: SourcePoint[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    minimum = Math.min(minimum, Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy)));
  }
  return minimum;
}

/** Produces a detached JSON-safe mask while preserving every source-resolution alpha value. */
export function serializeMask(mask: ProcessingMask): SerializedProcessingMask {
  return { width: mask.width, height: mask.height, alpha: Array.from(mask.data) };
}

/** Restores a serialized mask and rejects data whose dimensions no longer align. */
export function deserializeMask(serialized: SerializedProcessingMask): ProcessingMask {
  if (serialized.alpha.length !== serialized.width * serialized.height) throw new Error("Serialized mask dimensions are invalid.");
  return { width: serialized.width, height: serialized.height, data: new Uint8ClampedArray(serialized.alpha) };
}

/** Reports whether a mask contains at least one affected source pixel. */
export function maskHasSelection(mask: ProcessingMask): boolean {
  return mask.data.some((alpha) => alpha > 0);
}

/** Finds the source-space bounds used to anchor controls to the active selection. */
export function getMaskBounds(mask: ProcessingMask, alphaThreshold = 16): MaskBounds | null {
  let left = mask.width;
  let top = mask.height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < mask.data.length; index += 1) {
    if (mask.data[index] <= alphaThreshold) continue;
    const x = index % mask.width;
    const y = Math.floor(index / mask.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) return null;
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

/** Gives removal enough surrounding pixels to reconstruct and softly blend the exposed background. */
export function createGenerativeEffectiveMask(mask: ProcessingMask, operation: "remove" | "replace" | "restyle"): ProcessingMask {
  if (operation !== "remove") return { ...mask, data: new Uint8ClampedArray(mask.data) };
  const expansion = Math.min(18, Math.max(3, Math.round(Math.max(mask.width, mask.height) * 0.004)));
  const feather = Math.max(2, Math.round(expansion * 0.65));
  const limit = expansion + feather;
  const distances = new Float32Array(mask.data.length);
  distances.fill(Number.POSITIVE_INFINITY);
  for (let index = 0; index < mask.data.length; index += 1) if (mask.data[index] > 32) distances[index] = 0;

  const diagonal = Math.SQRT2;
  for (let y = 0; y < mask.height; y += 1) for (let x = 0; x < mask.width; x += 1) {
    const index = y * mask.width + x;
    if (x > 0) distances[index] = Math.min(distances[index], distances[index - 1] + 1);
    if (y > 0) distances[index] = Math.min(distances[index], distances[index - mask.width] + 1);
    if (x > 0 && y > 0) distances[index] = Math.min(distances[index], distances[index - mask.width - 1] + diagonal);
    if (x + 1 < mask.width && y > 0) distances[index] = Math.min(distances[index], distances[index - mask.width + 1] + diagonal);
  }
  for (let y = mask.height - 1; y >= 0; y -= 1) for (let x = mask.width - 1; x >= 0; x -= 1) {
    const index = y * mask.width + x;
    if (x + 1 < mask.width) distances[index] = Math.min(distances[index], distances[index + 1] + 1);
    if (y + 1 < mask.height) distances[index] = Math.min(distances[index], distances[index + mask.width] + 1);
    if (x + 1 < mask.width && y + 1 < mask.height) distances[index] = Math.min(distances[index], distances[index + mask.width + 1] + diagonal);
    if (x > 0 && y + 1 < mask.height) distances[index] = Math.min(distances[index], distances[index + mask.width - 1] + diagonal);
  }

  const data = new Uint8ClampedArray(mask.data);
  for (let index = 0; index < data.length; index += 1) {
    const distance = distances[index];
    if (distance <= expansion) data[index] = 255;
    else if (distance < limit) data[index] = Math.max(data[index], Math.round(255 * (limit - distance) / feather));
  }
  return { ...mask, data };
}
