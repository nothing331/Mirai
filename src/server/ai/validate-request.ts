import type { ImageEditRequest } from "./contracts";

/** Rejects provider requests that cannot produce an aligned image edit. */
export function validateImageEditRequest(request: ImageEditRequest): void {
  if (request.width <= 0 || request.height <= 0) throw new Error("Image dimensions must be positive.");
  if (request.imagePng.length === 0) throw new Error("An image is required.");
  if (request.operation === "transform" && request.maskPng) throw new Error("Transform must not send an inpainting mask to the image provider.");
  if (request.operation !== "transform" && (!request.maskPng || request.maskPng.length === 0)) throw new Error("A mask is required for localized edits.");
  if (request.operation !== "remove" && request.prompt.trim().length === 0) throw new Error("Describe the requested change.");
}
