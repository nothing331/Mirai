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

/** Candidate pixels that have not yet advanced accepted history. */
export interface EditPreview {
  id: string;
  inputVersionId: string;
  selectionId: string;
  color: string;
  mask: MaskAsset;
  pixels: Uint8ClampedArray;
  dataUrl: string;
}

export interface EditOperation {
  id: string;
  inputVersionId: string;
  outputVersionId: string | null;
  maskId: string;
  type: "recolor";
  parameters: { color: string };
  method: "local";
  status: "draft" | "accepted" | "failed";
}
