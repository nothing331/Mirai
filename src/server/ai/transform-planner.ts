import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import type { TransformPlan } from "@/shared/transform-fidelity";

export interface TransformPlannerRequest {
  imagePng: Uint8Array;
  width: number;
  height: number;
}

export interface TransformPlannerResult {
  plan: TransformPlan;
  providerRequestId: string;
}

export interface TransformPlanner {
  plan(request: TransformPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<TransformPlannerResult>;
}

export function buildTransformPlannerInstruction(): string {
  return [
    "Analyze the attached source image for a later style-only transformation.",
    "Describe the actual visible scene, primary subjects, subject count, identity cues, pose or geometry, framing, camera angle, spatial relationships, and background structure.",
    "Create preservation constraints that prevent a later image model from substituting a different subject, setting, object category, or composition.",
    "Do not choose an artistic style and do not suggest creative additions. The transformation preset is handled elsewhere.",
    "Treat visible details as evidence. Do not infer names, brands, identities, or facts that are not visually established.",
    "Return a concise structured plan suitable for direct inclusion in an image-edit instruction.",
  ].join(" ");
}
