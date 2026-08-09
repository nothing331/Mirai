import type { AssetCreationRequest, AssetGenerationCapabilities, AssetGenerationResponse } from "@/shared/asset-generation";

export class AssetGenerationRequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly imageGenerationAttempted: boolean, readonly requestId: string | null) {
    super(message);
    this.name = "AssetGenerationRequestError";
  }
}

export async function getAssetGenerationCapabilities(): Promise<AssetGenerationCapabilities> {
  const response = await fetch("/api/asset-generations");
  if (!response.ok) throw new Error("Asset generation configuration could not be loaded.");
  return response.json() as Promise<AssetGenerationCapabilities>;
}

export async function requestAssetCandidates(creation: AssetCreationRequest, projectId: string, requestId: string): Promise<AssetGenerationResponse> {
  const response = await fetch("/api/asset-generations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-project-id": projectId, "x-request-id": requestId },
    body: JSON.stringify(creation),
  });
  const result = await response.json() as AssetGenerationResponse | { error?: string; retryable?: boolean; imageGenerationAttempted?: boolean; requestId?: string };
  if (!response.ok || !("candidates" in result)) {
    throw new AssetGenerationRequestError(
      "error" in result ? result.error ?? "Asset generation failed." : "Asset generation failed.",
      "retryable" in result && result.retryable === true,
      "imageGenerationAttempted" in result && result.imageGenerationAttempted === true,
      "requestId" in result ? result.requestId ?? null : null,
    );
  }
  window.dispatchEvent(new CustomEvent("request-diagnostic-updated"));
  return result;
}

export function candidateDataUrl(candidateBase64: string): string {
  return `data:image/png;base64,${candidateBase64}`;
}
