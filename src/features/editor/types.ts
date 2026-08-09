import type { CandidateAnalysis, EditBoundaryPolicy } from "@/shared/edit-boundary";

export type Tool = "lasso" | "brush" | "eraser" | "pan";
export type EditorMode = "ai" | "transform" | "text" | "watermark";
export type TransformType = "crop" | "resize" | "rotate" | "flip";

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

export interface OverlayImageAsset {
  id: string;
  width: number;
  height: number;
  mediaType: "image/png";
  pixels: Uint8ClampedArray;
  dataUrl: string;
  originalName: string;
}

export interface CropRect { x: number; y: number; width: number; height: number }
export type CropRatio = "free" | "original" | "1:1" | "4:5" | "3:2" | "16:9" | "9:16";

export interface TextOverlayParameters {
  content: string;
  x: number;
  y: number;
  width: number;
  fontFamily: "Manrope" | "Georgia" | "DM Mono";
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  color: string;
  opacity: number;
  rotation: number;
  align: "left" | "center" | "right";
  backgroundColor: string | null;
  padding: number;
}

export interface WatermarkParameters {
  source: "text" | "image";
  content: string;
  overlayAssetId: string | null;
  x: number;
  y: number;
  width: number;
  fontFamily: "Manrope" | "Georgia" | "DM Mono";
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  anchor: "free" | "north-west" | "north" | "north-east" | "west" | "center" | "east" | "south-west" | "south" | "south-east";
  margin: number;
}

export type LocalEditDraft =
  | { id: string; inputVersionId: string; type: "crop"; parameters: { sourceRect: CropRect; ratio: CropRatio } }
  | { id: string; inputVersionId: string; type: "resize"; parameters: { width: number; height: number; preserveAspectRatio: boolean; preventUpscale: boolean } }
  | { id: string; inputVersionId: string; type: "rotate"; parameters: { quarterTurns: 1 | 2 | 3 } }
  | { id: string; inputVersionId: string; type: "flip"; parameters: { axis: "horizontal" | "vertical" } }
  | { id: string; inputVersionId: string; type: "text"; parameters: TextOverlayParameters }
  | { id: string; inputVersionId: string; type: "watermark"; parameters: WatermarkParameters };

export type EditType = "recolor" | "remove" | "replace" | "restyle";
export type FakeScenario = "success" | "slow" | "retryable-error" | "fatal-error";

interface PreviewBase {
  id: string;
  inputVersionId: string;
  selectionId: string | null;
  mask: MaskAsset | null;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  dataUrl: string;
}

export type EditPreview = PreviewBase & (
  | { type: "recolor"; method: "local"; parameters: { color: string } }
  | { type: "crop"; method: "local"; parameters: { sourceRect: CropRect; ratio: CropRatio } }
  | { type: "resize"; method: "local"; parameters: { width: number; height: number; preserveAspectRatio: boolean; preventUpscale: boolean } }
  | { type: "rotate"; method: "local"; parameters: { quarterTurns: 1 | 2 | 3 } }
  | { type: "flip"; method: "local"; parameters: { axis: "horizontal" | "vertical" } }
  | { type: "text"; method: "local"; parameters: TextOverlayParameters }
  | { type: "watermark"; method: "local"; parameters: WatermarkParameters }
  | { type: "remove" | "replace" | "restyle"; method: "generative"; parameters: { prompt: string; providerRequestId: string; diagnosticRequestId: string; boundaryPolicy: EditBoundaryPolicy; candidateAnalysis: CandidateAnalysis } }
);

interface OperationBase {
  id: string;
  inputVersionId: string;
  outputVersionId: string | null;
  maskId: string | null;
  status: "draft" | "accepted" | "failed";
}

export type EditOperation = OperationBase & (
  | { type: "recolor"; method: "local"; parameters: { color: string } }
  | { type: "crop"; method: "local"; parameters: { sourceRect: CropRect; ratio: CropRatio } }
  | { type: "resize"; method: "local"; parameters: { width: number; height: number; preserveAspectRatio: boolean; preventUpscale: boolean } }
  | { type: "rotate"; method: "local"; parameters: { quarterTurns: 1 | 2 | 3 } }
  | { type: "flip"; method: "local"; parameters: { axis: "horizontal" | "vertical" } }
  | { type: "text"; method: "local"; parameters: TextOverlayParameters }
  | { type: "watermark"; method: "local"; parameters: WatermarkParameters }
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
