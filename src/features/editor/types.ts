import type { CandidateAnalysis, EditBoundaryPolicy } from "@/shared/edit-boundary";

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

interface PreviewBase {
  id: string;
  inputVersionId: string;
  mask: MaskAsset;
  pixels: Uint8ClampedArray;
  dataUrl: string;
}

export type EditPreview = PreviewBase & (
  | { type: "recolor"; method: "local"; parameters: { color: string } }
  | { type: "paint"; method: "local"; parameters: { colors: string[]; strokeCount: number } }
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
  | { type: "remove" | "replace" | "restyle"; method: "generative"; parameters: { prompt: string; providerRequestId: string; diagnosticRequestId: string; boundaryPolicy: EditBoundaryPolicy; candidateAnalysis: CandidateAnalysis } }
);

export interface GenerativeRequestSnapshot {
  projectId: string;
  requestId: string;
  retryOfRequestId: string | null;
  inputVersion: ImageVersion;
  selectionId: string;
  selectionMask: ProcessingMask;
  providerMask: ProcessingMask;
  boundaryPolicy: EditBoundaryPolicy;
  operation: "remove" | "replace" | "restyle";
  prompt: string;
  scenario: FakeScenario;
}

export type GenerativePreviewState =
  | { status: "idle"; snapshot: null; error: null; retryable: false }
  | { status: "processing"; snapshot: GenerativeRequestSnapshot; error: null; retryable: false }
  | { status: "preview"; snapshot: GenerativeRequestSnapshot; error: null; retryable: false }
  | { status: "failed"; snapshot: GenerativeRequestSnapshot; error: string; retryable: boolean };
