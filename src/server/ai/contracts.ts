import type { ImageEditDiagnosticSink } from "../../shared/request-diagnostics";
import type { EditPlan } from "../../shared/edit-plan";
import type { EditBoundaryPolicy } from "../../shared/edit-boundary";

export type GenerativeOperation = "remove" | "replace" | "restyle";
export type ProviderScenario = "success" | "slow" | "retryable-error" | "fatal-error";

/** Provider-neutral request whose image and mask are same-size PNG byte arrays. */
export interface ImageEditRequest {
  imagePng: Uint8Array;
  maskPng: Uint8Array;
  width: number;
  height: number;
  operation: GenerativeOperation;
  boundaryPolicy: EditBoundaryPolicy;
  prompt: string;
  plan?: EditPlan;
  scenario?: ProviderScenario;
}

/** Normalized provider candidate; no SDK-specific response types cross this boundary. */
export interface ProviderCandidate {
  candidatePng: Uint8Array;
  providerRequestId: string;
}

export interface ImageEditProvider {
  edit(request: ImageEditRequest, diagnostics?: ImageEditDiagnosticSink): Promise<ProviderCandidate>;
}

export class ImageProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly diagnostics?: {
      providerRequestId?: string | null;
      status?: number;
      code?: string;
      type?: string;
    },
  ) {
    super(message);
    this.name = "ImageProviderError";
  }
}
