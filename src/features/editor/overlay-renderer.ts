import type { ImageVersion, OverlayImageAsset, TextOverlayParameters, WatermarkParameters } from "./types";
import type { PixelResult } from "./local-transforms";

function sourceCanvas(version: ImageVersion): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = version.width;
  canvas.height = version.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available in this browser.");
  context.putImageData(new ImageData(new Uint8ClampedArray(version.pixels), version.width, version.height), 0, 0);
  return { canvas, context };
}

function wrapLines(context: CanvasRenderingContext2D, content: string, width: number): string[] {
  const paragraphs = content.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= width) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function result(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): PixelResult {
  return { width: canvas.width, height: canvas.height, pixels: new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data) };
}

export function renderTextOverlay(version: ImageVersion, parameters: TextOverlayParameters): PixelResult {
  const { canvas, context } = sourceCanvas(version);
  const lineHeight = parameters.fontSize * 1.18;
  context.font = `${parameters.fontWeight} ${parameters.fontSize}px "${parameters.fontFamily}", sans-serif`;
  const contentWidth = Math.max(1, parameters.width - parameters.padding * 2);
  const lines = wrapLines(context, parameters.content, contentWidth);
  const boxHeight = Math.max(lineHeight, lines.length * lineHeight) + parameters.padding * 2;
  context.save();
  context.globalAlpha = parameters.opacity;
  context.translate(parameters.x, parameters.y);
  context.rotate(parameters.rotation * Math.PI / 180);
  if (parameters.backgroundColor) {
    context.fillStyle = parameters.backgroundColor;
    context.fillRect(0, 0, parameters.width, boxHeight);
  }
  context.fillStyle = parameters.color;
  context.textBaseline = "top";
  context.textAlign = parameters.align;
  const textX = parameters.align === "left" ? parameters.padding : parameters.align === "center" ? parameters.width / 2 : parameters.width - parameters.padding;
  lines.forEach((line, index) => context.fillText(line, textX, parameters.padding + index * lineHeight, contentWidth));
  context.restore();
  return result(canvas, context);
}

export function renderWatermarkOverlay(version: ImageVersion, parameters: WatermarkParameters, asset: OverlayImageAsset | null): PixelResult {
  if (parameters.source === "text") {
    return renderTextOverlay(version, {
      content: parameters.content,
      x: parameters.x,
      y: parameters.y,
      width: parameters.width,
      fontFamily: parameters.fontFamily,
      fontSize: parameters.fontSize,
      fontWeight: 700,
      color: parameters.color,
      opacity: parameters.opacity,
      rotation: parameters.rotation,
      align: "center",
      backgroundColor: null,
      padding: 0,
    });
  }
  if (!asset) throw new Error("Upload a transparent PNG watermark before previewing.");
  const { canvas, context } = sourceCanvas(version);
  const overlay = document.createElement("canvas");
  overlay.width = asset.width;
  overlay.height = asset.height;
  const overlayContext = overlay.getContext("2d");
  if (!overlayContext) throw new Error("Canvas rendering is not available in this browser.");
  overlayContext.putImageData(new ImageData(new Uint8ClampedArray(asset.pixels), asset.width, asset.height), 0, 0);
  const height = parameters.width * asset.height / asset.width;
  context.save();
  context.globalAlpha = parameters.opacity;
  context.translate(parameters.x, parameters.y);
  context.rotate(parameters.rotation * Math.PI / 180);
  context.drawImage(overlay, 0, 0, parameters.width, height);
  context.restore();
  return result(canvas, context);
}
