"use client";

import Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { displayToSource, fitViewport } from "./coordinates";
import { SelectionCommentPopover } from "./SelectionCommentPopover";
import { useEditorStore } from "./store";
import type { ImageVersion, LocalEditDraft, ProcessingMask, SourcePoint, Viewport } from "./types";

function useHtmlImage(source: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!source) return;
    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = source;
    return () => { nextImage.onload = null; };
  }, [source]);
  return source ? image : null;
}

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
    pixels[pixel] = red; pixels[pixel + 1] = green; pixels[pixel + 2] = blue;
    pixels[pixel + 3] = Math.round(mask.data[index] * 0.58);
  }
  context.putImageData(new ImageData(pixels, mask.width, mask.height), 0, 0);
  return canvas;
}

function draftDimensions(version: ImageVersion, draft: LocalEditDraft | null) {
  if (draft?.type === "resize") return { width: draft.parameters.width, height: draft.parameters.height };
  if (draft?.type === "rotate" && draft.parameters.quarterTurns !== 2) return { width: version.height, height: version.width };
  return { width: version.width, height: version.height };
}

export function EditorCanvas({ version, mask, color, viewResetKey, onPreview }: { version: ImageVersion; mask: ProcessingMask; color: string; viewResetKey: number; onPreview: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<SourcePoint | null>(null);
  const lassoPointsRef = useRef<SourcePoint[]>([]);
  const panStartRef = useRef<{ pointer: SourcePoint; viewport: Viewport } | null>(null);
  const transformNodeRef = useRef<Konva.Node>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [lassoPoints, setLassoPoints] = useState<SourcePoint[]>([]);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const image = useHtmlImage(version.dataUrl);
  const maskCanvas = useMemo(() => makeMaskCanvas(mask, color), [mask, color]);
  const state = useEditorStore();
  const { viewport, tool, selectionId, lassoVisualization, editorMode, localDraft, overlayAssets, setViewport, fillSelection, paintSelection, updateLocalDraft } = state;
  const overlayAsset = localDraft?.type === "watermark" ? overlayAssets.find((asset) => asset.id === localDraft.parameters.overlayAssetId) ?? null : null;
  const watermarkImage = useHtmlImage(overlayAsset?.dataUrl ?? null);
  const displayed = draftDimensions(version, localDraft);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (next.width <= 0 || next.height <= 0) return;
      setSize(next);
      setViewport(fitViewport(next.width, next.height, displayed.width, displayed.height));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [setViewport, displayed.width, displayed.height, viewResetKey]);

  useEffect(() => {
    if (viewport.scale > 0 && transformNodeRef.current && transformerRef.current && localDraft && (localDraft.type === "crop" || localDraft.type === "text" || localDraft.type === "watermark")) {
      transformerRef.current.nodes([transformNodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [localDraft, viewport.scale]);

  useEffect(() => {
    if (!localDraft) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") { state.cancelLocalDraft(); return; }
      if (!event.key.startsWith("Arrow")) return;
      const distance = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
      const dy = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
      if (localDraft.type === "crop") {
        const rect = localDraft.parameters.sourceRect;
        updateLocalDraft({ ...localDraft, parameters: { ...localDraft.parameters, sourceRect: { ...rect, x: Math.max(0, Math.min(version.width - rect.width, rect.x + dx)), y: Math.max(0, Math.min(version.height - rect.height, rect.y + dy)) } } });
      } else if (localDraft.type === "text") updateLocalDraft({ ...localDraft, parameters: { ...localDraft.parameters, x: localDraft.parameters.x + dx, y: localDraft.parameters.y + dy } });
      else if (localDraft.type === "watermark") updateLocalDraft({ ...localDraft, parameters: { ...localDraft.parameters, x: localDraft.parameters.x + dx, y: localDraft.parameters.y + dy, anchor: "free" } });
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localDraft, state, updateLocalDraft, version.height, version.width]);

  function sourcePoint(stage: Konva.Stage): SourcePoint | null {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const point = displayToSource(pointer, viewport);
    if (point.x < 0 || point.y < 0 || point.x >= version.width || point.y >= version.height) return null;
    return point;
  }

  function beginDraw(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (editorMode !== "ai" || state.preview) return;
    if (tool === "pan") {
      const pointer = event.target.getStage()?.getPointerPosition();
      if (pointer) panStartRef.current = { pointer, viewport };
      return;
    }
    const point = sourcePoint(event.target.getStage()!);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    if (tool === "lasso") { lassoPointsRef.current = [point]; setLassoPoints([point]); }
    else paintSelection(point, point);
  }

  function continueDraw(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (editorMode !== "ai" || state.preview) return;
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
      if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 2.5 / Math.max(0.05, viewport.scale)) {
        lassoPointsRef.current = [...lassoPointsRef.current, point]; setLassoPoints(lassoPointsRef.current);
      }
    } else paintSelection(lastPointRef.current, point);
    lastPointRef.current = point;
  }

  function endDraw() {
    if (drawingRef.current && tool === "lasso" && lassoPointsRef.current.length >= 3) fillSelection(lassoPointsRef.current, viewport.scale);
    drawingRef.current = false; lastPointRef.current = null; lassoPointsRef.current = []; setLassoPoints([]); panStartRef.current = null;
  }

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
    imageProps.width = version.width; imageProps.height = version.height;
    if (localDraft.parameters.quarterTurns === 1) { imageProps.x = version.height; imageProps.rotation = 90; }
    else if (localDraft.parameters.quarterTurns === 2) { imageProps.x = version.width; imageProps.y = version.height; imageProps.rotation = 180; }
    else { imageProps.y = version.width; imageProps.rotation = 270; }
  } else if (localDraft?.type === "flip") {
    imageProps.width = version.width; imageProps.height = version.height;
    if (localDraft.parameters.axis === "horizontal") { imageProps.x = version.width; imageProps.scaleX = -1; }
    else { imageProps.y = version.height; imageProps.scaleY = -1; }
  }

  return (
    <div ref={containerRef} className={`absolute inset-0 tool-${editorMode === "ai" ? tool : localDraft?.type ?? editorMode}`} data-testid="editor-canvas" data-viewport-x={viewport.x} data-viewport-y={viewport.y} data-viewport-scale={viewport.scale}>
      <Stage width={size.width} height={size.height} onMouseDown={beginDraw} onMouseMove={continueDraw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={beginDraw} onTouchMove={continueDraw} onTouchEnd={endDraw} onWheel={handleWheel}>
        <Layer>
          <Rect width={size.width} height={size.height} fill="#151513" />
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            <Rect width={displayed.width} height={displayed.height} fill="rgba(0,0,0,0.001)" />
            {image && <KonvaImage image={image} {...imageProps} listening={false} />}
            {editorMode === "ai" && <KonvaImage image={maskCanvas} width={version.width} height={version.height} listening={false} />}
            {editorMode === "ai" && lassoVisualization?.showRawContour && lassoVisualization.rawPoints.length > 1 && <Line points={lassoVisualization.rawPoints.flatMap((point) => [point.x, point.y])} closed stroke="#ffad33" strokeWidth={Math.max(1, 1.5 / viewport.scale)} dash={[4 / viewport.scale, 4 / viewport.scale]} opacity={0.9} listening={false} />}
            {editorMode === "ai" && lassoVisualization && lassoVisualization.cleanedPoints.length > 1 && <Line points={lassoVisualization.cleanedPoints.flatMap((point) => [point.x, point.y])} closed stroke="#d8f441" strokeWidth={Math.max(1, 1.25 / viewport.scale)} opacity={0.9} listening={false} />}
            {editorMode === "ai" && lassoPoints.length > 1 && <Line points={lassoPoints.flatMap((point) => [point.x, point.y])} stroke={color} strokeWidth={Math.max(1, 2 / viewport.scale)} dash={[6 / viewport.scale, 4 / viewport.scale]} listening={false} />}

            {localDraft?.type === "crop" && <CropDraftOverlay draft={localDraft} imageWidth={version.width} imageHeight={version.height} nodeRef={transformNodeRef} transformerRef={transformerRef} onChange={updateLocalDraft} viewportScale={viewport.scale} />}
            {localDraft?.type === "text" && <TextDraftOverlay draft={localDraft} nodeRef={transformNodeRef} transformerRef={transformerRef} onChange={updateLocalDraft} viewportScale={viewport.scale} />}
            {localDraft?.type === "watermark" && <WatermarkDraftOverlay draft={localDraft} image={watermarkImage} assetRatio={overlayAsset ? overlayAsset.height / overlayAsset.width : 0.25} nodeRef={transformNodeRef} transformerRef={transformerRef} onChange={updateLocalDraft} viewportScale={viewport.scale} />}
          </Group>
        </Layer>
      </Stage>
      {editorMode === "ai" && selectionId && <SelectionCommentPopover mask={mask} viewport={viewport} canvasSize={size} selectionId={selectionId} onPreview={onPreview} />}
    </div>
  );
}

function CropDraftOverlay({ draft, imageWidth, imageHeight, nodeRef, transformerRef, onChange, viewportScale }: { draft: Extract<LocalEditDraft, { type: "crop" }>; imageWidth: number; imageHeight: number; nodeRef: React.RefObject<Konva.Node | null>; transformerRef: React.RefObject<Konva.Transformer | null>; onChange: (draft: LocalEditDraft) => void; viewportScale: number }) {
  const rect = draft.parameters.sourceRect;
  function commit(node: Konva.Rect) {
    const x = Math.max(0, Math.min(imageWidth - 1, node.x()));
    const y = Math.max(0, Math.min(imageHeight - 1, node.y()));
    const width = Math.max(1, Math.min(imageWidth - x, node.width() * node.scaleX()));
    const height = Math.max(1, Math.min(imageHeight - y, node.height() * node.scaleY()));
    node.scaleX(1); node.scaleY(1);
    onChange({ ...draft, parameters: { ...draft.parameters, sourceRect: { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) } } });
  }
  const dim = "rgba(9,9,8,.62)";
  return <>
    <Rect x={0} y={0} width={imageWidth} height={rect.y} fill={dim} listening={false} />
    <Rect x={0} y={rect.y + rect.height} width={imageWidth} height={imageHeight - rect.y - rect.height} fill={dim} listening={false} />
    <Rect x={0} y={rect.y} width={rect.x} height={rect.height} fill={dim} listening={false} />
    <Rect x={rect.x + rect.width} y={rect.y} width={imageWidth - rect.x - rect.width} height={rect.height} fill={dim} listening={false} />
    <Rect ref={nodeRef as React.RefObject<Konva.Rect>} {...rect} stroke="#d8f441" strokeWidth={Math.max(1, 2 / viewportScale)} draggable dragBoundFunc={(position) => ({ x: Math.max(0, Math.min(imageWidth - rect.width, position.x)), y: Math.max(0, Math.min(imageHeight - rect.height, position.y)) })} onDragEnd={(event) => commit(event.target as Konva.Rect)} onTransformEnd={(event) => commit(event.target as Konva.Rect)} />
    {[1 / 3, 2 / 3].map((fraction) => <Line key={`v${fraction}`} points={[rect.x + rect.width * fraction, rect.y, rect.x + rect.width * fraction, rect.y + rect.height]} stroke="rgba(255,255,255,.62)" strokeWidth={Math.max(.5, 1 / viewportScale)} listening={false} />)}
    {[1 / 3, 2 / 3].map((fraction) => <Line key={`h${fraction}`} points={[rect.x, rect.y + rect.height * fraction, rect.x + rect.width, rect.y + rect.height * fraction]} stroke="rgba(255,255,255,.62)" strokeWidth={Math.max(.5, 1 / viewportScale)} listening={false} />)}
    <Transformer ref={transformerRef} rotateEnabled={false} keepRatio={draft.parameters.ratio !== "free"} borderEnabled={false} anchorFill="#d8f441" anchorStroke="#171714" anchorSize={Math.max(8, 10 / viewportScale)} flipEnabled={false} />
  </>;
}

function TextDraftOverlay({ draft, nodeRef, transformerRef, onChange, viewportScale }: { draft: Extract<LocalEditDraft, { type: "text" }>; nodeRef: React.RefObject<Konva.Node | null>; transformerRef: React.RefObject<Konva.Transformer | null>; onChange: (draft: LocalEditDraft) => void; viewportScale: number }) {
  const parameters = draft.parameters;
  function commit(node: Konva.Text) {
    const scaleX = node.scaleX(); const scaleY = node.scaleY(); node.scaleX(1); node.scaleY(1);
    onChange({ ...draft, parameters: { ...parameters, x: node.x(), y: node.y(), width: Math.max(24, node.width() * scaleX), fontSize: Math.max(8, Math.round(parameters.fontSize * scaleY)), rotation: node.rotation() } });
  }
  return <>
    {parameters.backgroundColor && <Rect x={parameters.x} y={parameters.y} width={parameters.width} height={parameters.fontSize * 1.5 + parameters.padding * 2} fill={parameters.backgroundColor} opacity={parameters.opacity} rotation={parameters.rotation} listening={false} />}
    <Text ref={nodeRef as React.RefObject<Konva.Text>} {...parameters} fill={parameters.color} fontStyle={parameters.fontWeight >= 600 ? "bold" : "normal"} padding={parameters.padding} draggable onDragEnd={(event) => commit(event.target as Konva.Text)} onTransformEnd={(event) => commit(event.target as Konva.Text)} />
    <Transformer ref={transformerRef} enabledAnchors={["middle-left", "middle-right", "top-left", "top-right", "bottom-left", "bottom-right"]} anchorFill="#d8f441" anchorStroke="#171714" anchorSize={Math.max(8, 10 / viewportScale)} rotationSnaps={[0, 45, 90, 180, 270]} />
  </>;
}

function WatermarkDraftOverlay({ draft, image, assetRatio, nodeRef, transformerRef, onChange, viewportScale }: { draft: Extract<LocalEditDraft, { type: "watermark" }>; image: HTMLImageElement | null; assetRatio: number; nodeRef: React.RefObject<Konva.Node | null>; transformerRef: React.RefObject<Konva.Transformer | null>; onChange: (draft: LocalEditDraft) => void; viewportScale: number }) {
  const parameters = draft.parameters;
  function commit(node: Konva.Node) {
    const scaleX = Math.abs(node.scaleX()); node.scaleX(1); node.scaleY(1);
    onChange({ ...draft, parameters: { ...parameters, x: node.x(), y: node.y(), width: Math.max(24, parameters.width * scaleX), rotation: node.rotation(), anchor: "free" } });
  }
  const common = { ref: nodeRef, x: parameters.x, y: parameters.y, width: parameters.width, opacity: parameters.opacity, rotation: parameters.rotation, draggable: true, onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => commit(event.target), onTransformEnd: (event: Konva.KonvaEventObject<Event>) => commit(event.target) };
  return <>
    {parameters.source === "image" && image ? <KonvaImage {...common} ref={nodeRef as React.RefObject<Konva.Image>} image={image} height={parameters.width * assetRatio} /> : <Text {...common} ref={nodeRef as React.RefObject<Konva.Text>} text={parameters.content} fill={parameters.color} fontFamily={parameters.fontFamily} fontSize={parameters.fontSize} fontStyle="bold" align="center" />}
    <Transformer ref={transformerRef} keepRatio enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} anchorFill="#d8f441" anchorStroke="#171714" anchorSize={Math.max(8, 10 / viewportScale)} rotationSnaps={[0, 45, 90, 180, 270]} />
  </>;
}
