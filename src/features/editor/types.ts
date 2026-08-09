import type { CandidateAnalysis, EditBoundaryPolicy } from "@/shared/edit-boundary";
import type { TransformFidelityAssessment } from "@/shared/transform-fidelity";
import type { TransformPresetId, TransformPreservationMode } from "@/shared/transform-presets";
import type { ExtendPresetId } from "@/shared/extend-presets";
import type { ExtendSceneAnalysis, ExtendStrategy, SmartReframePlan } from "@/shared/extend-plan";

export type Tool = "lasso" | "brush" | "eraser" | "pan";

export interface SourcePoint {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ProcessingMask {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PaintOverlay {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface PaintSession {
  id: string;
  baseVersionId: string;
  overlay: PaintOverlay;
  colors: string[];
  strokeCount: number;
}

export type SelectionMode = "draw" | "add" | "subtract";

export type SelectionWarning = "self-intersection" | "large-auto-correction" | "raw-contour-preserved";

export interface SelectionDiagnostics {
  rawPointCount: number;
  cleanedPointCount: number;
  removedSpikeCount: number;
  selfIntersectionCount: number;
  areaChangeRatio: number;
  warnings: SelectionWarning[];
}

export interface LassoVisualization {
  rawPoints: SourcePoint[];
  cleanedPoints: SourcePoint[];
  showRawContour: boolean;
}

/** JSON-safe representation used when a full-resolution mask crosses a storage boundary. */
export interface SerializedProcessingMask {
  width: number;
  height: number;
  alpha: number[];
}

export interface ImageVersion {
  id: string;
  parentVersionId: string | null;
  width: number;
  height: number;
  mediaType: "image/png" | "image/jpeg";
  pixels: Uint8ClampedArray;
  dataUrl: string;
}

/** Immutable mask snapshot captured at preview creation. */
export interface MaskAsset extends ProcessingMask {
  id: string;
}

export type EditType = "recolor" | "remove" | "replace" | "restyle";
export type FakeScenario = "success" | "slow" | "retryable-error" | "fatal-error";

export interface TransformInput {
  presetId: TransformPresetId | null;
  presetVersion: number | null;
  userPrompt: string;
  preservationMode: TransformPreservationMode;
}

interface GenerativeTransformParameters extends TransformInput {
  resolvedInstruction: string;
  providerRequestId: string;
  diagnosticRequestId: string;
  candidateAnalysis: CandidateAnalysis;
  transformFidelityAssessment: TransformFidelityAssessment;
}

interface PreviewBase {
  id: string;
  inputVersionId: string;
  mask: MaskAsset;
  pixels: Uint8ClampedArray;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ExtendInput { presetId: ExtendPresetId; presetVersion: 1; strategy: ExtendStrategy; userPrompt: string }
export interface ExtendParameters extends ExtendInput { plan: SmartReframePlan; analysis: ExtendSceneAnalysis; resolvedInstruction: string; providerRequestId: string; diagnosticRequestId: string }

export type EditPreview = PreviewBase & (
  | { type: "recolor"; method: "local"; parameters: { color: string } }
  | { type: "paint"; method: "local"; parameters: { colors: string[]; strokeCount: number } }
  | { type: "transform"; method: "local"; parameters: TransformInput & { resolvedInstruction: string } }
  | { type: "transform"; method: "generative"; parameters: GenerativeTransformParameters }
  | { type: "extend"; method: "generative"; parameters: ExtendParameters }
  | { type: "remove" | "replace" | "restyle"; method: "generative"; parameters: { prompt: string; providerRequestId: string; diagnosticRequestId: string; boundaryPolicy: EditBoundaryPolicy; candidateAnalysis: CandidateAnalysis } }
);

interface OperationBase {
  id: string;
  inputVersionId: string;
  outputVersionId: string | null;
  maskId: string;
  status: "draft" | "accepted" | "failed";
}

export type EditOperation = OperationBase & (
  | { type: "recolor"; method: "local"; parameters: { color: string } }
  | { type: "paint"; method: "local"; parameters: { colors: string[]; strokeCount: number } }
  | { type: "transform"; method: "local"; parameters: TransformInput & { resolvedInstruction: string } }
  | { type: "transform"; method: "generative"; parameters: GenerativeTransformParameters }
  | { type: "extend"; method: "generative"; parameters: ExtendParameters }
  | { type: "remove" | "replace" | "restyle"; method: "generative"; parameters: { prompt: string; providerRequestId: string; diagnosticRequestId: string; boundaryPolicy: EditBoundaryPolicy; candidateAnalysis: CandidateAnalysis } }
);

interface GenerativeRequestBase {
  projectId: string;
  requestId: string;
  retryOfRequestId: string | null;
  inputVersion: ImageVersion;
  providerMask: ProcessingMask;
  scenario: FakeScenario;
}

export interface LocalizedGenerativeRequestSnapshot extends GenerativeRequestBase {
  selectionId: string;
  selectionMask: ProcessingMask;
  boundaryPolicy: EditBoundaryPolicy;
  operation: "remove" | "replace" | "restyle";
  prompt: string;
}

export interface TransformRequestSnapshot extends GenerativeRequestBase, TransformInput {
  operation: "transform";
}

export type GenerativeRequestSnapshot = LocalizedGenerativeRequestSnapshot | TransformRequestSnapshot;

export type GenerativePreviewState =
  | { status: "idle"; snapshot: null; error: null; retryable: false }
  | { status: "processing"; snapshot: GenerativeRequestSnapshot; error: null; retryable: false }
  | { status: "preview"; snapshot: GenerativeRequestSnapshot; error: null; retryable: false }
  | { status: "failed"; snapshot: GenerativeRequestSnapshot; error: string; retryable: boolean };

export type ExtendDraftState =
  | { status: "idle"; input: ExtendInput | null; analysis: ExtendSceneAnalysis | null; plan: null; error: null }
  | { status: "analyzing"; input: ExtendInput; analysis: ExtendSceneAnalysis | null; plan: null; error: null }
  | { status: "planned"; input: ExtendInput; analysis: ExtendSceneAnalysis; plan: SmartReframePlan; error: null }
  | { status: "generating"; phase: "sending" | "generating" | "preparing"; input: ExtendInput; analysis: ExtendSceneAnalysis; plan: SmartReframePlan; error: null }
  | { status: "failed"; input: ExtendInput; analysis: ExtendSceneAnalysis | null; plan: SmartReframePlan | null; error: string };
