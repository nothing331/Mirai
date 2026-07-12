import { compositeCandidate } from "./composite";
import { decodeImage, pixelsToDataUrl } from "./image-data";
import type { GenerativeRequestSnapshot } from "./types";

interface GenerativeCandidate {
  pixels: Uint8ClampedArray;
  dataUrl: string;
  providerRequestId: string;
}

export class GenerativeRequestError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "GenerativeRequestError";
  }
}

/** Calls the server provider and authoritatively restores every unselected input byte. */
export async function requestGenerativeCandidate(snapshot: GenerativeRequestSnapshot): Promise<GenerativeCandidate> {
  const form = new FormData();
  form.set("image", new File([await (await fetch(snapshot.inputVersion.dataUrl)).blob()], "image.png", { type: "image/png" }));
  form.set("mask", new File([maskToPngBlob(snapshot.mask)], "mask.png", { type: "image/png" }));
  form.set("operation", snapshot.operation);
  form.set("prompt", snapshot.prompt);
  form.set("scenario", snapshot.scenario);
  const response = await fetch("/api/image-edits", { method: "POST", body: form });
  const payload = await response.json() as { candidateBase64?: string; providerRequestId?: string; error?: string; retryable?: boolean };
  if (!response.ok || !payload.candidateBase64 || !payload.providerRequestId) throw new GenerativeRequestError(payload.error ?? "The image provider returned an invalid response.", payload.retryable ?? false);
  const candidateBlob = await fetch(`data:image/png;base64,${payload.candidateBase64}`).then((result) => result.blob());
  const candidate = await decodeImage(new File([candidateBlob], "candidate.png", { type: "image/png" }));
  if (candidate.width !== snapshot.inputVersion.width || candidate.height !== snapshot.inputVersion.height) throw new GenerativeRequestError("The provider candidate dimensions do not match the input image.", false);
  const pixels = compositeCandidate(snapshot.inputVersion.pixels, candidate.pixels, snapshot.mask);
  return { pixels, dataUrl: pixelsToDataUrl(pixels, candidate.width, candidate.height), providerRequestId: payload.providerRequestId };
}

/** Encodes positive selection alpha as a full-resolution PNG mask for transport. */
function maskToPngBlob(mask: GenerativeRequestSnapshot["mask"]): Blob {
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
