import { z } from "zod";
import type { TransformPreservationMode } from "./transform-presets";

const confidenceSchema = z.enum(["high", "medium", "low"]);

export const transformPlanSchema = z.object({
  sourceSummary: z.string().min(1),
  primarySubjects: z.array(z.object({
    description: z.string().min(1),
    count: z.number().int().min(1),
    position: z.string().min(1),
    poseOrGeometry: z.string().min(1),
    identityCues: z.array(z.string().min(1)),
  })),
  composition: z.object({
    framing: z.string().min(1),
    cameraAngle: z.string().min(1),
    spatialRelationships: z.array(z.string().min(1)),
    backgroundStructure: z.array(z.string().min(1)),
  }),
  mustPreserve: z.array(z.string().min(1)),
  prohibitedChanges: z.array(z.string().min(1)),
  confidence: confidenceSchema,
});

export type TransformPlan = z.infer<typeof transformPlanSchema>;

export const transformFidelityAssessmentSchema = z.object({
  verdict: z.enum(["pass", "warning", "block"]),
  subjectPreservation: z.number().min(0).max(1),
  compositionPreservation: z.number().min(0).max(1),
  primarySubjectsMissing: z.array(z.string().min(1)),
  unrelatedSubjectsAdded: z.array(z.string().min(1)),
  compositionChanges: z.array(z.string().min(1)),
  explanation: z.string().min(1),
  confidence: confidenceSchema,
  validationAvailable: z.boolean(),
});

export type TransformFidelityAssessment = z.infer<typeof transformFidelityAssessmentSchema>;

/** Faithful and Balanced transforms fail closed when semantic fidelity cannot be established. */
export function blocksTransformAcceptance(
  preservationMode: TransformPreservationMode,
  assessment: TransformFidelityAssessment,
): boolean {
  return preservationMode !== "imaginative" && assessment.verdict === "block";
}

export function unavailableTransformFidelityAssessment(): TransformFidelityAssessment {
  return {
    verdict: "block",
    subjectPreservation: 0,
    compositionPreservation: 0,
    primarySubjectsMissing: [],
    unrelatedSubjectsAdded: [],
    compositionChanges: [],
    explanation: "Semantic fidelity validation was unavailable, so this proposal cannot be safely accepted in Faithful or Balanced mode.",
    confidence: "low",
    validationAvailable: false,
  };
}
