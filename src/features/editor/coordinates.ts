import type { SourcePoint, Viewport } from "./types";

/** Inverts the viewport transform so persisted input always uses source pixels. */
export function displayToSource(
  displayPoint: SourcePoint,
  viewport: Viewport,
): SourcePoint {
  return {
    x: (displayPoint.x - viewport.x) / viewport.scale,
    y: (displayPoint.y - viewport.y) / viewport.scale,
  };
}

/** Centers an image inside a container without enlarging it beyond source size. */
export function fitViewport(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): Viewport {
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight, 1);
  return {
    scale,
    x: (containerWidth - imageWidth * scale) / 2,
    y: (containerHeight - imageHeight * scale) / 2,
  };
}
