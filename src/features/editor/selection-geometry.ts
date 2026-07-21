import type { SourcePoint } from "./types";

export interface CleanedContour {
  rawPoints: SourcePoint[];
  points: SourcePoint[];
  removedSpikeCount: number;
  selfIntersectionCount: number;
  rawArea: number;
  cleanedArea: number;
  areaChangeRatio: number;
  usedRawContour: boolean;
}

const distance = (a: SourcePoint, b: SourcePoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Removes duplicate samples that add no geometry and can destabilize later contour checks. */
function deduplicatePoints(points: SourcePoint[]): SourcePoint[] {
  const result: SourcePoint[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (!previous || distance(previous, point) > 0.01) result.push(point);
  }
  if (result.length > 1 && distance(result[0], result.at(-1)!) < 0.01) result.pop();
  return result;
}

/** Calculates the absolute area of a closed polygon in source pixels. */
export function polygonArea(points: SourcePoint[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function distanceToSegment(point: SourcePoint, start: SourcePoint, end: SourcePoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const amount = Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + amount * dx, y: start.y + amount * dy });
}

function simplifyOpenLine(points: SourcePoint[], tolerance: number): SourcePoint[] {
  if (points.length <= 2) return points;
  let furthestDistance = 0;
  let furthestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const candidate = distanceToSegment(points[index], points[0], points.at(-1)!);
    if (candidate > furthestDistance) {
      furthestDistance = candidate;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= tolerance) return [points[0], points.at(-1)!];
  const before = simplifyOpenLine(points.slice(0, furthestIndex + 1), tolerance);
  const after = simplifyOpenLine(points.slice(furthestIndex), tolerance);
  return [...before.slice(0, -1), ...after];
}

/** Simplifies a closed contour without selecting an arbitrary seam as an important corner. */
export function simplifyClosedContour(points: SourcePoint[], tolerance: number): SourcePoint[] {
  if (points.length <= 4) return [...points];
  let splitIndex = 1;
  let splitDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = distance(points[0], points[index]);
    if (candidate > splitDistance) {
      splitDistance = candidate;
      splitIndex = index;
    }
  }
  const firstHalf = simplifyOpenLine(points.slice(0, splitIndex + 1), tolerance);
  const secondHalf = simplifyOpenLine([...points.slice(splitIndex), points[0]], tolerance);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

function angleAt(previous: SourcePoint, current: SourcePoint, next: SourcePoint): number {
  const ax = previous.x - current.x;
  const ay = previous.y - current.y;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denominator === 0) return Math.PI;
  return Math.acos(Math.min(1, Math.max(-1, (ax * bx + ay * by) / denominator)));
}

/** Removes only short, acute excursions whose removal barely changes selected area. */
export function removeContourSpikes(points: SourcePoint[], maximumLength: number): { points: SourcePoint[]; removedCount: number } {
  const result = [...points];
  const originalArea = Math.max(1, polygonArea(points));
  let removedCount = 0;
  let changed = true;
  while (changed && result.length > 4) {
    changed = false;
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index - 1 + result.length) % result.length];
      const current = result[index];
      const next = result[(index + 1) % result.length];
      if (distance(previous, current) > maximumLength || distance(current, next) > maximumLength || angleAt(previous, current, next) > Math.PI * 2 / 3) continue;
      const candidate = result.filter((_, candidateIndex) => candidateIndex !== index);
      if (Math.abs(polygonArea(candidate) - polygonArea(result)) / originalArea > 0.015) continue;
      result.splice(index, 1);
      removedCount += 1;
      changed = true;
      break;
    }
  }
  return { points: result, removedCount };
}

function orientation(a: SourcePoint, b: SourcePoint, c: SourcePoint): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentsIntersect(a: SourcePoint, b: SourcePoint, c: SourcePoint, d: SourcePoint): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return first * second < 0 && third * fourth < 0;
}

/** Counts crossings between non-adjacent contour segments. */
export function countSelfIntersections(points: SourcePoint[]): number {
  let count = 0;
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) count += 1;
    }
  }
  return count;
}

/** Cleans ordinary pointer jitter and falls back when cleanup would materially reinterpret intent. */
export function cleanLassoContour(rawPoints: SourcePoint[], viewportScale = 1): CleanedContour {
  const raw = deduplicatePoints(rawPoints);
  if (raw.length < 3) throw new Error("Draw a closed shape with at least three points.");
  const visualTolerance = Math.min(8, Math.max(0.75, 2.5 / Math.max(0.05, viewportScale)));
  const simplified = simplifyClosedContour(raw, visualTolerance);
  const spikeResult = removeContourSpikes(simplified, visualTolerance * 4);
  const rawArea = polygonArea(raw);
  const cleanedArea = polygonArea(spikeResult.points);
  const areaChangeRatio = rawArea === 0 ? 0 : Math.abs(cleanedArea - rawArea) / rawArea;
  const selfIntersectionCount = countSelfIntersections(raw);
  const usedRawContour = spikeResult.points.length < 3 || areaChangeRatio > 0.1 || selfIntersectionCount > 0;
  return {
    rawPoints: raw,
    points: usedRawContour ? raw : spikeResult.points,
    removedSpikeCount: usedRawContour ? 0 : spikeResult.removedCount,
    selfIntersectionCount,
    rawArea,
    cleanedArea: usedRawContour ? rawArea : cleanedArea,
    areaChangeRatio: usedRawContour ? 0 : areaChangeRatio,
    usedRawContour,
  };
}
