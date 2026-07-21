import type { ImageEditRequest } from "./contracts";

/** Rejects provider requests that cannot produce an aligned localized edit. */
export function validateImageEditRequest(request: ImageEditRequest): void {
  if (request.width <= 0 || request.height <= 0) throw new Error("Image dimensions must be positive.");
  if (request.imagePng.length === 0 || request.maskPng.length === 0) throw new Error("Image and mask are required.");
  if (request.operation !== "remove" && request.prompt.trim().length === 0) throw new Error("Describe the requested change.");
}
