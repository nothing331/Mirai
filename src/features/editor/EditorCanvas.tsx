"use client";

import Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva";
import { displayToSource, fitViewport } from "./coordinates";
import { useEditorStore } from "./store";
import type { ImageVersion, ProcessingMask, SourcePoint, Viewport } from "./types";

/** Loads a version data URL into the DOM image object consumed by Konva. */
function useHtmlImage(source: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = source;
    return () => { nextImage.onload = null; };
  }, [source]);
  return image;
}

/** Rasterizes the filled selection into a translucent color overlay. */
function makeMaskCanvas(mask: ProcessingMask, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const pixels = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let index = 0; index < mask.data.length; index += 1) {
    const pixel = index * 4;
    pixels[pixel] = red;
    pixels[pixel + 1] = green;
    pixels[pixel + 2] = blue;
    pixels[pixel + 3] = Math.round(mask.data[index] * 0.58);
  }
  context.putImageData(new ImageData(pixels, mask.width, mask.height), 0, 0);
  return canvas;
}

/** Draws closed contours and refines their filled source-resolution mask. */
export function EditorCanvas({ version, mask, color, viewResetKey }: { version: ImageVersion; mask: ProcessingMask; color: string; viewResetKey: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<SourcePoint | null>(null);
  const lassoPointsRef = useRef<SourcePoint[]>([]);
  const panStartRef = useRef<{ pointer: SourcePoint; viewport: Viewport } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<SourcePoint[]>([]);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const image = useHtmlImage(version.dataUrl);
  const maskCanvas = useMemo(() => makeMaskCanvas(mask, color), [mask, color]);
  const { viewport, tool, setViewport, fillSelection, paintSelection } = useEditorStore();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      setViewport(fitViewport(next.width, next.height, version.width, version.height));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [setViewport, version.width, version.height, viewResetKey]);

  /** Converts the live pointer into a clipped source-image point. */
  function sourcePoint(stage: Konva.Stage): SourcePoint | null {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const point = displayToSource(pointer, viewport);
    if (point.x < 0 || point.y < 0 || point.x >= version.width || point.y >= version.height) return null;
    return point;
  }

  /** Starts lasso capture, mask refinement, or viewport panning for the active tool. */
  function beginDraw(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool === "pan") {
      const pointer = event.target.getStage()?.getPointerPosition();
      if (pointer) panStartRef.current = { pointer, viewport };
      return;
    }
    const point = sourcePoint(event.target.getStage()!);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    if (tool === "lasso") {
      lassoPointsRef.current = [point];
      setLassoPoints([point]);
    } else {
      paintSelection(point, point);
    }
  }

  /** Extends the active contour, refinement stroke, or pan gesture. */
  function continueDraw(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool === "pan") {
      const pointer = event.target.getStage()?.getPointerPosition();
      const start = panStartRef.current;
      if (pointer && start) setViewport({ ...start.viewport, x: start.viewport.x + pointer.x - start.pointer.x, y: start.viewport.y + pointer.y - start.pointer.y });
      return;
    }
    if (!drawingRef.current) return;
    const point = sourcePoint(event.target.getStage()!);
    if (!point || !lastPointRef.current) return;
    if (tool === "lasso") {
      const previous = lassoPointsRef.current.at(-1)!;
      if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 1) {
        lassoPointsRef.current = [...lassoPointsRef.current, point];
        setLassoPoints(lassoPointsRef.current);
      }
    } else {
      paintSelection(lastPointRef.current, point);
    }
    lastPointRef.current = point;
  }

  /** Automatically closes and fills a completed lasso before clearing gesture state. */
  function endDraw() {
    if (drawingRef.current && tool === "lasso" && lassoPointsRef.current.length >= 3) fillSelection(lassoPointsRef.current);
    drawingRef.current = false;
    lastPointRef.current = null;
    lassoPointsRef.current = [];
    setLassoPoints([]);
    panStartRef.current = null;
  }

  /** Zooms around the pointer so the source pixel beneath it remains stationary. */
  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const source = displayToSource(pointer, viewport);
    const scale = Math.min(8, Math.max(0.05, viewport.scale * (event.evt.deltaY > 0 ? 0.9 : 1.1)));
    setViewport({ scale, x: pointer.x - source.x * scale, y: pointer.y - source.y * scale });
  }

  return (
    <div ref={containerRef} className={`absolute inset-0 tool-${tool}`} data-testid="editor-canvas" data-viewport-x={viewport.x} data-viewport-y={viewport.y} data-viewport-scale={viewport.scale}>
      <Stage width={size.width} height={size.height} onMouseDown={beginDraw} onMouseMove={continueDraw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={beginDraw} onTouchMove={continueDraw} onTouchEnd={endDraw} onWheel={handleWheel}>
        <Layer>
          <Rect width={size.width} height={size.height} fill="#151513" />
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            <Rect width={version.width} height={version.height} fill="rgba(0,0,0,0.001)" />
            {image && <KonvaImage image={image} width={version.width} height={version.height} listening={false} />}
            <KonvaImage image={maskCanvas} width={version.width} height={version.height} listening={false} />
            {lassoPoints.length > 1 && <Line points={lassoPoints.flatMap((point) => [point.x, point.y])} stroke={color} strokeWidth={Math.max(1, 2 / viewport.scale)} dash={[6 / viewport.scale, 4 / viewport.scale]} listening={false} />}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
