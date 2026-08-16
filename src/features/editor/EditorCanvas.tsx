"use client";

import Konva from "konva";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { displayToSource, fitViewport } from "./coordinates";
import { useEditorStore } from "./store";
import type { ImageVersion, LocalEditDraft, PaintOverlay, ProcessingMask, SourcePoint, Viewport } from "./types";
import { SelectionChip } from "./workspace/SelectionChip";

/** Loads a version data URL into the DOM image object consumed by Konva. */
function useHtmlImage(source: string | null) {
  const [loaded, setLoaded] = useState<{ source: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!source) return;
    const nextImage = new window.Image();
    nextImage.onload = () => setLoaded({ source, image: nextImage });
    nextImage.src = source;
    return () => { nextImage.onload = null; };
  }, [source]);
  return source && loaded?.source === source ? loaded.image : null;
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

function makePaintCanvas(overlay: PaintOverlay | null): HTMLCanvasElement | null {
  if (!overlay) return null;
  const canvas = document.createElement("canvas");
  canvas.width = overlay.width;
  canvas.height = overlay.height;
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(overlay.pixels), overlay.width, overlay.height), 0, 0);
  return canvas;
}

function draftDimensions(version: ImageVersion, draft: LocalEditDraft | null) {
  if (draft?.type === "resize") return { width: draft.parameters.width, height: draft.parameters.height };
  if (draft?.type === "rotate" && draft.parameters.quarterTurns !== 2) return { width: version.height, height: version.width };
  return { width: version.width, height: version.height };
}

/** Draws closed contours and refines their filled source-resolution mask. */
export function EditorCanvas({ version, mask, color, viewResetKey }: { version: ImageVersion; mask: ProcessingMask; color: string; viewResetKey: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<SourcePoint | null>(null);
  const lassoPointsRef = useRef<SourcePoint[]>([]);
  const paintPointsRef = useRef<SourcePoint[]>([]);
  const panStartRef = useRef<{ pointer: SourcePoint; viewport: Viewport } | null>(null);
  const transformNodeRef = useRef<Konva.Node>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [lassoPoints, setLassoPoints] = useState<SourcePoint[]>([]);
  const [paintPoints, setPaintPoints] = useState<SourcePoint[]>([]);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const image = useHtmlImage(version.dataUrl);
  const maskCanvas = useMemo(() => makeMaskCanvas(mask, color), [mask, color]);
  const { viewport, tool, selectionMode, selectionId, lassoVisualization, paintSession, brushSize, localDraft, overlayAssets, setViewport, fillSelection, refineSelection, applyPaintStroke, updateLocalDraft, discardLocalDraft } = useEditorStore();
  const paintCanvas = useMemo(() => makePaintCanvas(paintSession?.overlay ?? null), [paintSession?.overlay]);
  const overlayAsset = localDraft?.type === "watermark" ? overlayAssets.find((asset) => asset.id === localDraft.parameters.overlayAssetId) ?? null : null;
  const watermarkImage = useHtmlImage(overlayAsset?.dataUrl ?? null);
  const displayed = draftDimensions(version, localDraft);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      if (next.width <= 0 || next.height <= 0) return;
      setViewport(fitViewport(next.width, next.height, displayed.width, displayed.height));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [setViewport, displayed.width, displayed.height, viewResetKey]);

  useEffect(() => {
    if (!localDraft || !transformNodeRef.current || !transformerRef.current || (localDraft.type !== "crop" && localDraft.type !== "text" && localDraft.type !== "watermark")) return;
    transformerRef.current.nodes([transformNodeRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [localDraft, viewport.scale]);

  useEffect(() => {
    if (!localDraft) return;
    const draft = localDraft;
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape" || event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        discardLocalDraft();
        return;
      }
      if (!event.key.startsWith("Arrow")) return;
      const distance = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
      const dy = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
      if (draft.type === "crop") {
        const rect = draft.parameters.sourceRect;
        updateLocalDraft({ ...draft, parameters: { ...draft.parameters, sourceRect: { ...rect, x: Math.max(0, Math.min(version.width - rect.width, rect.x + dx)), y: Math.max(0, Math.min(version.height - rect.height, rect.y + dy)) } } });
      } else if (draft.type === "text") {
        updateLocalDraft({ ...draft, parameters: { ...draft.parameters, x: draft.parameters.x + dx, y: draft.parameters.y + dy } });
      } else if (draft.type === "watermark") {
        updateLocalDraft({ ...draft, parameters: { ...draft.parameters, x: draft.parameters.x + dx, y: draft.parameters.y + dy, anchor: "free" } });
      } else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [discardLocalDraft, localDraft, updateLocalDraft, version.height, version.width]);

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
    if (localDraft) return;
    if (tool === "pan") {
      const pointer = event.target.getStage()?.getPointerPosition();
      if (pointer) panStartRef.current = { pointer, viewport };
      return;
    }
    const point = sourcePoint(event.target.getStage()!);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    if (tool === "lasso" && selectionMode === "draw") {
      lassoPointsRef.current = [point];
      setLassoPoints([point]);
    } else if (tool === "lasso") {
      refineSelection(point, point);
    } else {
      paintPointsRef.current = [point];
      setPaintPoints([point]);
    }
  }

  /** Extends the active contour, refinement stroke, or pan gesture. */
  function continueDraw(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (localDraft) return;
    if (tool === "pan") {
      const pointer = event.target.getStage()?.getPointerPosition();
      const start = panStartRef.current;
      if (pointer && start) setViewport({ ...start.viewport, x: start.viewport.x + pointer.x - start.pointer.x, y: start.viewport.y + pointer.y - start.pointer.y });
      return;
    }
    if (!drawingRef.current) return;
    const point = sourcePoint(event.target.getStage()!);
    if (!point || !lastPointRef.current) return;
    if (tool === "lasso" && selectionMode === "draw") {
      const previous = lassoPointsRef.current.at(-1)!;
      if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 2.5 / Math.max(0.05, viewport.scale)) {
        lassoPointsRef.current = [...lassoPointsRef.current, point];
        setLassoPoints(lassoPointsRef.current);
      }
    } else if (tool === "lasso") {
      refineSelection(lastPointRef.current, point);
    } else {
      paintPointsRef.current = [...paintPointsRef.current, point];
      setPaintPoints(paintPointsRef.current);
    }
    lastPointRef.current = point;
  }

  /** Automatically closes and fills a completed lasso before clearing gesture state. */
  function endDraw() {
    if (localDraft) return;
    if (drawingRef.current && tool === "lasso" && selectionMode === "draw" && lassoPointsRef.current.length >= 3) fillSelection(lassoPointsRef.current, viewport.scale);
    if (drawingRef.current && (tool === "brush" || tool === "eraser")) applyPaintStroke(paintPointsRef.current, tool === "eraser");
    drawingRef.current = false;
    lastPointRef.current = null;
    lassoPointsRef.current = [];
    paintPointsRef.current = [];
    setLassoPoints([]);
    setPaintPoints([]);
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

  const imageProps: Record<string, number> = { x: 0, y: 0, width: displayed.width, height: displayed.height, rotation: 0, scaleX: 1, scaleY: 1 };
  if (localDraft?.type === "rotate") {
    imageProps.width = version.width;
    imageProps.height = version.height;
    if (localDraft.parameters.quarterTurns === 1) { imageProps.x = version.height; imageProps.rotation = 90; }
    else if (localDraft.parameters.quarterTurns === 2) { imageProps.x = version.width; imageProps.y = version.height; imageProps.rotation = 180; }
    else { imageProps.y = version.width; imageProps.rotation = 270; }
  } else if (localDraft?.type === "flip") {
    imageProps.width = version.width;
    imageProps.height = version.height;
    if (localDraft.parameters.axis === "horizontal") { imageProps.x = version.width; imageProps.scaleX = -1; }
    else { imageProps.y = version.height; imageProps.scaleY = -1; }
  }

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 tool-${localDraft?.type ?? tool}`}
      data-testid="editor-canvas"
      data-local-draft={localDraft?.type ?? "none"}
      data-draft-x={localDraft?.type === "text" || localDraft?.type === "watermark" ? localDraft.parameters.x : undefined}
      data-draft-y={localDraft?.type === "text" || localDraft?.type === "watermark" ? localDraft.parameters.y : undefined}
      data-draft-anchor={localDraft?.type === "watermark" ? localDraft.parameters.anchor : undefined}
      data-viewport-x={viewport.x}
      data-viewport-y={viewport.y}
      data-viewport-scale={viewport.scale}
    >
      <Stage width={size.width} height={size.height} onMouseDown={beginDraw} onMouseMove={continueDraw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={beginDraw} onTouchMove={continueDraw} onTouchEnd={endDraw} onWheel={handleWheel}>
        <Layer>
          <Rect width={size.width} height={size.height} fill="#151513" />
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            <Rect width={displayed.width} height={displayed.height} fill="rgba(0,0,0,0.001)" />
            {image && <KonvaImage image={image} {...imageProps} listening={false} />}
            {paintCanvas && !localDraft && <KonvaImage image={paintCanvas} width={version.width} height={version.height} listening={false} />}
            {!localDraft && tool === "lasso" && <KonvaImage image={maskCanvas} width={version.width} height={version.height} listening={false} />}
            {!localDraft && tool === "lasso" && lassoVisualization?.showRawContour && lassoVisualization.rawPoints.length > 1 && <Line points={lassoVisualization.rawPoints.flatMap((point) => [point.x, point.y])} closed stroke="#ffad33" strokeWidth={Math.max(1, 1.5 / viewport.scale)} dash={[4 / viewport.scale, 4 / viewport.scale]} opacity={0.9} listening={false} />}
            {!localDraft && tool === "lasso" && lassoVisualization && lassoVisualization.cleanedPoints.length > 1 && <Line points={lassoVisualization.cleanedPoints.flatMap((point) => [point.x, point.y])} closed stroke="#d8f441" strokeWidth={Math.max(1, 1.25 / viewport.scale)} opacity={0.9} listening={false} />}
            {!localDraft && tool === "lasso" && lassoPoints.length > 1 && <Line points={lassoPoints.flatMap((point) => [point.x, point.y])} stroke={color} strokeWidth={Math.max(1, 2 / viewport.scale)} dash={[6 / viewport.scale, 4 / viewport.scale]} listening={false} />}
            {!localDraft && tool === "brush" && paintPoints.length > 1 && <Line points={paintPoints.flatMap((point) => [point.x, point.y])} stroke={color} strokeWidth={brushSize} lineCap="round" lineJoin="round" opacity={0.85} listening={false} />}
            {!localDraft && tool === "eraser" && paintPoints.length > 1 && <Line points={paintPoints.flatMap((point) => [point.x, point.y])} stroke="#ffffff" strokeWidth={brushSize} lineCap="round" lineJoin="round" dash={[4 / viewport.scale, 3 / viewport.scale]} opacity={0.7} listening={false} />}
            {localDraft?.type === "crop" && <CropDraftOverlay draft={localDraft} imageWidth={version.width} imageHeight={version.height} nodeRef={transformNodeRef} transformerRef={transformerRef} onChange={updateLocalDraft} viewportScale={viewport.scale} />}
            {localDraft?.type === "text" && <TextDraftOverlay draft={localDraft} imageWidth={version.width} imageHeight={version.height} nodeRef={transformNodeRef} transformerRef={transformerRef} onChange={updateLocalDraft} viewportScale={viewport.scale} />}
            {localDraft?.type === "watermark" && <WatermarkDraftOverlay draft={localDraft} image={watermarkImage} assetRatio={overlayAsset ? overlayAsset.height / overlayAsset.width : 0.25} imageWidth={version.width} imageHeight={version.height} nodeRef={transformNodeRef} transformerRef={transformerRef} onChange={updateLocalDraft} viewportScale={viewport.scale} />}
          </Group>
        </Layer>
      </Stage>
      {!localDraft && tool === "lasso" && selectionId && <SelectionChip mask={mask} viewport={viewport} canvasSize={size} />}
    </div>
  );
}

function CropDraftOverlay({ draft, imageWidth, imageHeight, nodeRef, transformerRef, onChange, viewportScale }: { draft: Extract<LocalEditDraft, { type: "crop" }>; imageWidth: number; imageHeight: number; nodeRef: RefObject<Konva.Node | null>; transformerRef: RefObject<Konva.Transformer | null>; onChange: (draft: LocalEditDraft) => void; viewportScale: number }) {
  const rect = draft.parameters.sourceRect;
  function commit(node: Konva.Rect) {
    const x = Math.max(0, Math.min(imageWidth - 1, node.x()));
    const y = Math.max(0, Math.min(imageHeight - 1, node.y()));
    const width = Math.max(1, Math.min(imageWidth - x, node.width() * node.scaleX()));
    const height = Math.max(1, Math.min(imageHeight - y, node.height() * node.scaleY()));
    node.scaleX(1);
    node.scaleY(1);
    onChange({ ...draft, parameters: { ...draft.parameters, sourceRect: { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) } } });
  }
  const dim = "rgba(9,9,8,.62)";
  return <>
    <Rect x={0} y={0} width={imageWidth} height={rect.y} fill={dim} listening={false} />
    <Rect x={0} y={rect.y + rect.height} width={imageWidth} height={imageHeight - rect.y - rect.height} fill={dim} listening={false} />
    <Rect x={0} y={rect.y} width={rect.x} height={rect.height} fill={dim} listening={false} />
    <Rect x={rect.x + rect.width} y={rect.y} width={imageWidth - rect.x - rect.width} height={rect.height} fill={dim} listening={false} />
    <Rect
      ref={nodeRef as RefObject<Konva.Rect>}
      {...rect}
      stroke="#d8f441"
      strokeWidth={Math.max(1, 2 / viewportScale)}
      draggable
      dragBoundFunc={(position) => ({ x: Math.max(0, Math.min(imageWidth - rect.width, position.x)), y: Math.max(0, Math.min(imageHeight - rect.height, position.y)) })}
      onMouseEnter={(event) => setStageCursor(event.target, "move")}
      onMouseLeave={(event) => setStageCursor(event.target, "default")}
      onDragEnd={(event) => commit(event.target as Konva.Rect)}
      onTransformEnd={(event) => commit(event.target as Konva.Rect)}
    />
    {[1 / 3, 2 / 3].map((fraction) => <Line key={`v${fraction}`} points={[rect.x + rect.width * fraction, rect.y, rect.x + rect.width * fraction, rect.y + rect.height]} stroke="rgba(255,255,255,.62)" strokeWidth={Math.max(0.5, 1 / viewportScale)} listening={false} />)}
    {[1 / 3, 2 / 3].map((fraction) => <Line key={`h${fraction}`} points={[rect.x, rect.y + rect.height * fraction, rect.x + rect.width, rect.y + rect.height * fraction]} stroke="rgba(255,255,255,.62)" strokeWidth={Math.max(0.5, 1 / viewportScale)} listening={false} />)}
    <Transformer
      ref={transformerRef}
      rotateEnabled={false}
      keepRatio={draft.parameters.ratio !== "free"}
      borderEnabled={false}
      anchorFill="#d8f441"
      anchorStroke="#171714"
      anchorSize={Math.max(8, 10 / viewportScale)}
      flipEnabled={false}
      boundBoxFunc={(oldBox, nextBox) => nextBox.width < 8 || nextBox.height < 8 || nextBox.x < 0 || nextBox.y < 0 || nextBox.x + nextBox.width > imageWidth || nextBox.y + nextBox.height > imageHeight ? oldBox : nextBox}
    />
  </>;
}

function TextDraftOverlay({ draft, imageWidth, imageHeight, nodeRef, transformerRef, onChange, viewportScale }: { draft: Extract<LocalEditDraft, { type: "text" }>; imageWidth: number; imageHeight: number; nodeRef: RefObject<Konva.Node | null>; transformerRef: RefObject<Konva.Transformer | null>; onChange: (draft: LocalEditDraft) => void; viewportScale: number }) {
  const parameters = draft.parameters;
  const estimatedHeight = estimateTextHeight(parameters.content, parameters.width, parameters.fontSize, parameters.padding);
  function commit(node: Konva.Group) {
    const scaleX = Math.abs(node.scaleX());
    const scaleY = Math.abs(node.scaleY());
    node.scaleX(1);
    node.scaleY(1);
    onChange({ ...draft, parameters: { ...parameters, x: node.x(), y: node.y(), width: Math.max(24, parameters.width * scaleX), fontSize: Math.max(8, Math.round(parameters.fontSize * scaleY)), rotation: node.rotation() } });
  }
  return <>
    <Group
      ref={nodeRef as RefObject<Konva.Group>}
      x={parameters.x}
      y={parameters.y}
      rotation={parameters.rotation}
      opacity={parameters.opacity}
      draggable
      dragBoundFunc={(position) => ({ x: Math.max(-parameters.width * 0.8, Math.min(imageWidth - parameters.width * 0.2, position.x)), y: Math.max(-estimatedHeight * 0.8, Math.min(imageHeight - estimatedHeight * 0.2, position.y)) })}
      onMouseEnter={(event) => setStageCursor(event.target, "grab")}
      onMouseDown={(event) => setStageCursor(event.target, "grabbing")}
      onMouseUp={(event) => setStageCursor(event.target, "grab")}
      onMouseLeave={(event) => setStageCursor(event.target, "default")}
      onDragEnd={(event) => commit(event.target as Konva.Group)}
      onTransformEnd={(event) => commit(event.target as Konva.Group)}
    >
      {parameters.backgroundColor ? <Rect width={parameters.width} height={estimatedHeight} fill={parameters.backgroundColor} listening={false} /> : null}
      <Text
        text={parameters.content}
        width={parameters.width}
        fontFamily={parameters.fontFamily}
        fontSize={parameters.fontSize}
        fontStyle={parameters.fontWeight >= 600 ? "bold" : "normal"}
        fill={parameters.color}
        align={parameters.align}
        padding={parameters.padding}
        lineHeight={1.18}
        wrap="word"
        listening={false}
      />
    </Group>
    <Transformer ref={transformerRef} enabledAnchors={["middle-left", "middle-right", "top-left", "top-right", "bottom-left", "bottom-right"]} anchorFill="#d8f441" anchorStroke="#171714" anchorSize={Math.max(8, 10 / viewportScale)} rotationSnaps={[0, 45, 90, 180, 270]} flipEnabled={false} boundBoxFunc={(oldBox, nextBox) => Math.abs(nextBox.width) < 24 || Math.abs(nextBox.height) < 12 ? oldBox : nextBox} />
  </>;
}

function WatermarkDraftOverlay({ draft, image, assetRatio, imageWidth, imageHeight, nodeRef, transformerRef, onChange, viewportScale }: { draft: Extract<LocalEditDraft, { type: "watermark" }>; image: HTMLImageElement | null; assetRatio: number; imageWidth: number; imageHeight: number; nodeRef: RefObject<Konva.Node | null>; transformerRef: RefObject<Konva.Transformer | null>; onChange: (draft: LocalEditDraft) => void; viewportScale: number }) {
  const parameters = draft.parameters;
  const height = parameters.source === "image" ? parameters.width * assetRatio : parameters.fontSize * 1.25;
  function commit(node: Konva.Node) {
    const scaleX = Math.abs(node.scaleX());
    node.scaleX(1);
    node.scaleY(1);
    onChange({ ...draft, parameters: { ...parameters, x: node.x(), y: node.y(), width: Math.max(24, parameters.width * scaleX), rotation: node.rotation(), anchor: "free" } });
  }
  const common = {
    ref: nodeRef,
    x: parameters.x,
    y: parameters.y,
    width: parameters.width,
    opacity: parameters.opacity,
    rotation: parameters.rotation,
    draggable: true,
    dragBoundFunc: (position: { x: number; y: number }) => ({ x: Math.max(-parameters.width * 0.8, Math.min(imageWidth - parameters.width * 0.2, position.x)), y: Math.max(-height * 0.8, Math.min(imageHeight - height * 0.2, position.y)) }),
    onMouseEnter: (event: Konva.KonvaEventObject<MouseEvent>) => setStageCursor(event.target, "grab"),
    onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => setStageCursor(event.target, "grabbing"),
    onMouseUp: (event: Konva.KonvaEventObject<MouseEvent>) => setStageCursor(event.target, "grab"),
    onMouseLeave: (event: Konva.KonvaEventObject<MouseEvent>) => setStageCursor(event.target, "default"),
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => commit(event.target),
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => commit(event.target),
  };
  return <>
    {parameters.source === "image" && image
      ? <KonvaImage {...common} ref={nodeRef as RefObject<Konva.Image>} image={image} height={height} />
      : <Text {...common} ref={nodeRef as RefObject<Konva.Text>} text={parameters.content} fill={parameters.color} fontFamily={parameters.fontFamily} fontSize={parameters.fontSize} fontStyle="bold" align="center" />}
    <Transformer ref={transformerRef} keepRatio enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} anchorFill="#d8f441" anchorStroke="#171714" anchorSize={Math.max(8, 10 / viewportScale)} rotationSnaps={[0, 45, 90, 180, 270]} flipEnabled={false} boundBoxFunc={(oldBox, nextBox) => Math.abs(nextBox.width) < 24 || Math.abs(nextBox.height) < 8 ? oldBox : nextBox} />
  </>;
}

function estimateTextHeight(content: string, width: number, fontSize: number, padding: number) {
  const averageCharacterWidth = fontSize * 0.55;
  const charactersPerLine = Math.max(1, Math.floor(Math.max(1, width - padding * 2) / averageCharacterWidth));
  const lineCount = content.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return Math.max(fontSize * 1.18, lineCount * fontSize * 1.18) + padding * 2;
}

function setStageCursor(node: Konva.Node, cursor: string) {
  const stage = node.getStage();
  if (stage) stage.container().style.cursor = cursor;
}
