import type { ProcessingMask, SerializedProcessingMask, SourcePoint } from "./types";

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
