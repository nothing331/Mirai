import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";

export interface AssetGeneratorRequest {
  mode: "mark" | "image";
  prompt: string;
  count: 1;
  width: number;
  height: number;
  quality: "low";
  matteColor: string | null;
  colors: string[];
}

export interface RawAssetCandidate {
  png: Uint8Array;
  ordinal: number;
}

export interface AssetGeneratorResult {
  candidates: RawAssetCandidate[];
  providerRequestId: string;
}

export interface AssetGenerator {
  generate(request: AssetGeneratorRequest, diagnostics?: ImageEditDiagnosticSink): Promise<AssetGeneratorResult>;
}

export class AssetGenerationProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly diagnostics?: { providerRequestId?: string | null; status?: number; code?: string; type?: string },
  ) {
    super(message);
    this.name = "AssetGenerationProviderError";
  }
}
