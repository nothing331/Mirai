import { getTransformPreset, type TransformPresetId, type TransformPreservationMode } from "@/shared/transform-presets";
import type { TransformPlan } from "@/shared/transform-fidelity";

export interface TransformInstructionInput {
  presetId: TransformPresetId | null;
  presetVersion: number | null;
  userPrompt: string;
  preservationMode: TransformPreservationMode;
  plan?: TransformPlan;
}

const preservationInstructions: Record<TransformPreservationMode, string> = {
  faithful: "Preserve subject identity, facial characteristics, poses, object geometry, camera position, spatial layout, and background structure. Change primarily the rendering medium, texture, palette, and visual treatment.",
  balanced: "Preserve recognizable subjects and the principal composition. Allow moderate adaptation of lighting, texture, details, and environmental treatment where needed for a cohesive result.",
  imaginative: "Use the input as the compositional and semantic foundation, while allowing broader reinterpretation of lighting, scenery, shapes, details, and atmosphere.",
};

/** Resolves a versioned preset and deterministically composes the complete-image provider instruction. */
export function buildTransformInstruction(input: TransformInstructionInput): string {
  const userPrompt = input.userPrompt.trim();
  if (!input.presetId && !userPrompt) throw new Error("Choose a transformation preset or describe a custom transformation.");
  const preset = input.presetId && input.presetVersion !== null ? getTransformPreset(input.presetId, input.presetVersion) : null;
  if (input.presetId && !preset) throw new Error("The selected transformation preset version is not available.");

  const presetInstruction = preset
    ? `Render it as ${preset.recipe.medium}. Use ${joinNatural(preset.recipe.characteristics)}. Preserve ${joinNatural(preset.recipe.preservation)}. Do not introduce ${joinNatural(preset.recipe.exclusions)}.`
    : "Follow the user's custom visual direction precisely.";
  const refinement = userPrompt ? `Additional creative direction: ${userPrompt}.` : "";

  return [
    "Perform a style transformation of the attached input image, not a new scene generation. The attached image is the sole source of subjects, objects, composition, and environment.",
    input.plan ? buildTransformPreservationContext(input.plan) : "Do not replace the source scene with a different subject, setting, or composition.",
    presetInstruction,
    preservationInstructions[input.preservationMode],
    refinement,
    "Keep the original aspect ratio and return a complete edge-to-edge image. Do not add borders or crop existing subjects accidentally.",
  ].filter(Boolean).join(" ");
}

/** Converts the vision plan into explicit source-content locks for image generation. */
export function buildTransformPreservationContext(plan: TransformPlan): string {
  const subjects = plan.primarySubjects.map((subject) => [
    `${subject.count} × ${subject.description}`,
    `positioned ${subject.position}`,
    `with ${subject.poseOrGeometry}`,
    subject.identityCues.length ? `identified by ${subject.identityCues.join(", ")}` : "",
  ].filter(Boolean).join(" ")).join("; ");
  return [
    `Source scene: ${plan.sourceSummary}.`,
    subjects ? `Primary subjects that must remain: ${subjects}.` : "",
    `Preserve the framing (${plan.composition.framing}) and camera angle (${plan.composition.cameraAngle}).`,
    plan.composition.spatialRelationships.length ? `Preserve these spatial relationships: ${plan.composition.spatialRelationships.join("; ")}.` : "",
    plan.composition.backgroundStructure.length ? `Preserve this background structure: ${plan.composition.backgroundStructure.join("; ")}.` : "",
    plan.mustPreserve.length ? `Mandatory preservation constraints: ${plan.mustPreserve.join("; ")}.` : "",
    plan.prohibitedChanges.length ? `Prohibited changes: ${plan.prohibitedChanges.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

function joinNatural(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
