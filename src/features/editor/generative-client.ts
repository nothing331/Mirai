import { compositeCandidate } from "./composite";
import { decodeImage, pixelsToDataUrl } from "./image-data";
import type { GenerativeRequestSnapshot, ProcessingMask } from "./types";

interface GenerativeCandidate {
  pixels: Uint8ClampedArray;
  dataUrl: string;
  providerRequestId: string;
  diagnosticRequestId: string;
}

export class GenerativeRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly requestId?: string,
    public readonly imageGenerationAttempted = false,
  ) {
    super(message);
    this.name = "GenerativeRequestError";
  }
}

/** Calls the server provider and authoritatively restores every unselected input byte. */
export async function requestGenerativeCandidate(snapshot: GenerativeRequestSnapshot): Promise<GenerativeCandidate> {
  const form = new FormData();
  const sourcePng = pixelsToDataUrl(snapshot.inputVersion.pixels, snapshot.inputVersion.width, snapshot.inputVersion.height);
  form.set("image", new File([await (await fetch(sourcePng)).blob()], "image.png", { type: "image/png" }));
  form.set("selectionMask", new File([maskToPngBlob(snapshot.selectionMask)], "selection-mask.png", { type: "image/png" }));
  form.set("mask", new File([maskToPngBlob(snapshot.effectiveMask)], "effective-mask.png", { type: "image/png" }));
  form.set("operation", snapshot.operation);
  form.set("prompt", snapshot.prompt);
  form.set("scenario", snapshot.scenario);
  const headers: Record<string, string> = {
    "x-project-id": snapshot.projectId,
    "x-request-id": snapshot.requestId,
  };
  if (snapshot.retryOfRequestId) headers["x-retry-of-request-id"] = snapshot.retryOfRequestId;
  const response = await fetch("/api/image-edits", { method: "POST", headers, body: form });
  const payload = await response.json() as {
    candidateBase64?: string;
    providerRequestId?: string;
    projectId?: string;
    requestId?: string;
    error?: string;
    retryable?: boolean;
    imageGenerationAttempted?: boolean;
  };
  const responseRequestId = payload.requestId ?? response.headers.get("x-request-id") ?? snapshot.requestId;
  if (!response.ok || !payload.candidateBase64 || !payload.providerRequestId) {
    if (payload.imageGenerationAttempted === false) {
      window.dispatchEvent(new CustomEvent("image-generation-skipped", { detail: { requestId: responseRequestId } }));
    }
    throw new GenerativeRequestError(
      payload.error ?? "The image provider returned an invalid response.",
      payload.retryable ?? false,
      responseRequestId,
      payload.imageGenerationAttempted ?? false,
    );
  }
  const candidateBlob = await fetch(`data:image/png;base64,${payload.candidateBase64}`).then((result) => result.blob());
  const candidate = await decodeImage(new File([candidateBlob], "candidate.png", { type: "image/png" }));
  if (candidate.width !== snapshot.inputVersion.width || candidate.height !== snapshot.inputVersion.height) {
    throw new GenerativeRequestError("The provider candidate dimensions do not match the input image.", false, responseRequestId);
  }
  const pixels = compositeCandidate(snapshot.inputVersion.pixels, candidate.pixels, snapshot.effectiveMask);
  const dataUrl = pixelsToDataUrl(pixels, candidate.width, candidate.height);
  await uploadFinalPreview(snapshot.projectId, responseRequestId, dataUrl);
  return { pixels, dataUrl, providerRequestId: payload.providerRequestId, diagnosticRequestId: responseRequestId };
}

/** Encodes positive selection alpha as a full-resolution PNG mask for transport. */
function maskToPngBlob(mask: ProcessingMask): Blob {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available.");
  const pixels = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let index = 0; index < mask.data.length; index += 1) {
    const pixel = index * 4;
    pixels[pixel] = 255;
    pixels[pixel + 1] = 255;
    pixels[pixel + 2] = 255;
    pixels[pixel + 3] = mask.data[index];
  }
  context.putImageData(new ImageData(pixels, mask.width, mask.height), 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1]);
  return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type: "image/png" });
}

async function uploadFinalPreview(projectId: string, requestId: string, dataUrl: string): Promise<void> {
  try {
    const form = new FormData();
    form.set("finalPreview", new File([await (await fetch(dataUrl)).blob()], "final-preview.png", { type: "image/png" }));
    const response = await fetch(`/api/request-logs/${encodeURIComponent(requestId)}/client-artifacts`, {
      method: "POST",
      headers: { "x-project-id": projectId },
      body: form,
    });
    if (!response.ok) console.error(`[diagnostics:${requestId}] Final preview was not recorded.`, await response.text());
    window.dispatchEvent(new CustomEvent("request-diagnostic-updated", { detail: { requestId } }));
  } catch (error) {
    console.error(`[diagnostics:${requestId}] Final preview was not recorded.`, error);
  }
}
