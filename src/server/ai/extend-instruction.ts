import type { ExtendSceneAnalysis, SmartReframePlan } from "@/shared/extend-plan";

export function buildExtendInstruction(plan: SmartReframePlan, analysis: ExtendSceneAnalysis, userPrompt: string): string {
  const edges = Object.entries(plan.expansionInsets).filter(([, size]) => size > 0).map(([edge]) => `${edge}: ${analysis.edgeContinuation[edge as keyof typeof analysis.edgeContinuation]}`).join("; ");
  return [
    "Outpaint only into the transparent masked regions and narrow boundary seam.",
    "Continue the existing scene naturally while preserving the supplied subjects, identities, text, geometry, camera perspective, lighting, color treatment, and visual style.",
    `Visible edge continuation: ${edges || "continue the surrounding scene"}.`,
    "Do not add a new focal subject, duplicate an existing person or object, rewrite text, move existing content, add a logo, or reinterpret the protected source image.",
    userPrompt.trim() ? `Additional direction for the newly generated area only: ${userPrompt.trim()}.` : "Infer the missing surroundings only from the visible source image.",
  ].join(" ");
}
