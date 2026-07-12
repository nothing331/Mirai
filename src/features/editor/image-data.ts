import type { ImageVersion } from "./types";

/** Encodes immutable source pixels as a PNG data URL for browser display. */
export function pixelsToDataUrl(pixels: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available in this browser.");
  const canvasPixels = new Uint8ClampedArray(pixels.length);
  canvasPixels.set(pixels);
  context.putImageData(new ImageData(canvasPixels, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

/** Validates and decodes a local file into the editor's immutable original version. */
export async function decodeImage(file: File): Promise<ImageVersion> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    throw new Error("Upload a PNG or JPEG image.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas rendering is not available in this browser.");
    context.drawImage(bitmap, 0, 0);
    const pixels = new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data);
    return {
      id: crypto.randomUUID(),
      parentVersionId: null,
      width: bitmap.width,
      height: bitmap.height,
      mediaType: file.type,
      pixels,
      dataUrl: canvas.toDataURL(file.type),
    };
  } finally {
    bitmap.close();
  }
}

/** Downloads the accepted browser version directly without replaying edits or changing dimensions. */
export function exportVersion(version: ImageVersion, mediaType: "image/png" | "image/jpeg" = version.mediaType): void {
  const canvas = document.createElement("canvas");
  canvas.width = version.width;
  canvas.height = version.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available in this browser.");
  context.putImageData(new ImageData(new Uint8ClampedArray(version.pixels), version.width, version.height), 0, 0);
  const link = document.createElement("a");
  link.href = canvas.toDataURL(mediaType, 0.92);
  link.download = `local-edit-${version.width}x${version.height}.${mediaType === "image/jpeg" ? "jpg" : "png"}`;
  link.click();
}
