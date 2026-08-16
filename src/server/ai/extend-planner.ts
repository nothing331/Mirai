import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import type { ExtendSceneAnalysis } from "@/shared/extend-plan";

export interface ExtendPlannerRequest { imagePng: Uint8Array; width: number; height: number }
export interface ExtendPlannerResult { analysis: ExtendSceneAnalysis; providerRequestId: string }
export interface ExtendPlanner { analyze(request: ExtendPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<ExtendPlannerResult> }

export function buildExtendPlannerInstruction(): string {
  return [
    "Analyze the source image for conservative aspect-ratio reframing and outpainting.",
    "Locate every important subject and readable text region using normalized coordinates from 0 to 1.",
    "Mark primary subjects as mustPreserve. Identify genuine negative space, visual center, horizon, and what visibly continues across each edge.",
    "Do not propose a crop, output size, style change, or new object. Geometry is solved deterministically by the application.",
    "Use only visible evidence. Keep descriptions concise and return the required structured analysis.",
  ].join(" ");
}
