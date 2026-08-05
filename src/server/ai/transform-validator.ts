import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import type { TransformFidelityAssessment, TransformPlan } from "@/shared/transform-fidelity";
import type { TransformPreservationMode } from "@/shared/transform-presets";

export interface TransformValidatorRequest {
  sourcePng: Uint8Array;
  candidatePng: Uint8Array;
  width: number;
  height: number;
  plan: TransformPlan;
  preservationMode: TransformPreservationMode;
  changedPixelRatio: number;
}

export interface TransformValidatorResult {
  assessment: TransformFidelityAssessment;
  providerRequestId: string;
}

export interface TransformValidator {
  validate(request: TransformValidatorRequest, diagnostics?: ImageEditDiagnosticSink): Promise<TransformValidatorResult>;
}

export function buildTransformValidatorInstruction(request: Pick<TransformValidatorRequest, "plan" | "preservationMode" | "changedPixelRatio">): string {
  return [
    "Compare the first image (source) with the second image (style-transformed candidate).",
    "Evaluate semantic fidelity, not pixel similarity. Changes to palette, texture, linework, shading, lighting treatment, and rendering medium are expected.",
    "Block when a primary source subject disappears, changes category or identity, an unrelated primary subject is introduced, or the principal composition and environment are replaced.",
    "Use warning for recognizable but meaningful drift that remains manually reviewable. Use pass when subjects and principal composition remain recognizable.",
    `The requested preservation mode is ${request.preservationMode}. Faithful requires close subject, geometry, framing, and background preservation. Balanced permits detail and lighting adaptation but not scene substitution. Imaginative permits broader reinterpretation while retaining the source as its semantic foundation.`,
    `Pixel diagnostics report that ${(request.changedPixelRatio * 100).toFixed(1)}% of pixels changed materially. Treat near-total change as a reason for closer semantic scrutiny, not as automatic failure because legitimate style transfer can alter nearly every pixel.`,
    `Authoritative source plan: ${JSON.stringify(request.plan)}.`,
    "Set validationAvailable to true. Give a concise evidence-based explanation and confidence.",
  ].join(" ");
}
