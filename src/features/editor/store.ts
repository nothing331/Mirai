import { create } from "zustand";
import { pixelsToDataUrl } from "./image-data";
import { createMask, fillPolygonMask, maskHasSelection, paintMask } from "./mask";
import { recolorPixels } from "./recolor";
import type { EditOperation, EditPreview, ImageVersion, MaskAsset, ProcessingMask, SourcePoint, Tool, Viewport } from "./types";

interface EditorState {
  originalVersionId: string | null;
  currentVersionId: string | null;
  versions: ImageVersion[];
  operations: EditOperation[];
  maskAssets: MaskAsset[];
  preview: EditPreview | null;
  selectionMask: ProcessingMask | null;
  selectionId: string | null;
  viewport: Viewport;
  viewResetKey: number;
  tool: Tool;
  brushSize: number;
  maskSoftness: number;
  color: string;
  error: string | null;
  loadImage: (version: ImageVersion) => void;
  setViewport: (viewport: Viewport) => void;
  requestViewReset: () => void;
  setTool: (tool: Tool) => void;
  setBrushSize: (size: number) => void;
  setMaskSoftness: (softness: number) => void;
  setColor: (color: string) => void;
  setError: (error: string | null) => void;
  fillSelection: (points: SourcePoint[]) => void;
  paintSelection: (from: SourcePoint, to: SourcePoint) => void;
  clearSelection: () => void;
  createPreview: () => boolean;
  acceptPreview: () => boolean;
  discardPreview: () => void;
  reset: () => void;
}

const initialControls = {
  viewport: { x: 0, y: 0, scale: 1 },
  viewResetKey: 0,
  tool: "lasso" as Tool,
  brushSize: 40,
  maskSoftness: 0.2,
  color: "#ef4b32",
  error: null,
};

/** Owns one filled source-resolution selection and separates previews from accepted history. */
export const useEditorStore = create<EditorState>((set, get) => ({
  originalVersionId: null,
  currentVersionId: null,
  versions: [],
  operations: [],
  maskAssets: [],
  preview: null,
  selectionMask: null,
  selectionId: null,
  ...initialControls,
  loadImage: (version) => set((state) => ({
    originalVersionId: version.id,
    currentVersionId: version.id,
    versions: [version],
    operations: [],
    maskAssets: [],
    preview: null,
    selectionMask: createMask(version.width, version.height),
    selectionId: crypto.randomUUID(),
    viewResetKey: state.viewResetKey + 1,
    error: null,
  })),
  setViewport: (viewport) => set({ viewport }),
  requestViewReset: () => set((state) => ({ viewResetKey: state.viewResetKey + 1 })),
  setTool: (tool) => set({ tool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setMaskSoftness: (maskSoftness) => set({ maskSoftness }),
  setColor: (color) => set({ color, preview: null }),
  setError: (error) => set({ error }),
  fillSelection: (points) => set((state) => {
    if (!state.selectionMask) return {};
    try {
      const softnessPixels = state.brushSize * state.maskSoftness;
      return { selectionMask: fillPolygonMask(state.selectionMask, points, softnessPixels), preview: null, error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The closed selection could not be filled." };
    }
  }),
  paintSelection: (from, to) => set((state) => state.selectionMask ? {
    selectionMask: paintMask(state.selectionMask, from, to, state.brushSize / 2, state.tool === "eraser" ? 0 : 255, state.maskSoftness),
    preview: null,
    error: null,
  } : {}),
  clearSelection: () => set((state) => state.selectionMask ? {
    selectionMask: createMask(state.selectionMask.width, state.selectionMask.height),
    selectionId: crypto.randomUUID(),
    preview: null,
    error: null,
  } : {}),
  createPreview: () => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (!input || !state.selectionMask || !state.selectionId || !maskHasSelection(state.selectionMask)) {
      set({ error: "Draw a closed selection before previewing the edit." });
      return false;
    }
    try {
      const pixels = recolorPixels(input, state.selectionMask, state.color);
      const mask: MaskAsset = {
        id: crypto.randomUUID(), width: state.selectionMask.width, height: state.selectionMask.height,
        data: new Uint8ClampedArray(state.selectionMask.data),
      };
      set({
        preview: {
          id: crypto.randomUUID(), inputVersionId: input.id, selectionId: state.selectionId, color: state.color, mask,
          pixels, dataUrl: pixelsToDataUrl(pixels, input.width, input.height),
        },
        error: null,
      });
      return true;
    } catch (error) {
      set({ preview: null, error: error instanceof Error ? error.message : "The preview could not be created." });
      return false;
    }
  },
  acceptPreview: () => {
    const state = get();
    const preview = state.preview;
    const input = state.versions.find((version) => version.id === preview?.inputVersionId);
    if (!preview || !input || state.currentVersionId !== preview.inputVersionId) {
      set({ preview: null, error: "The preview is no longer based on the current image." });
      return false;
    }
    const outputId = crypto.randomUUID();
    const output: ImageVersion = {
      ...input, id: outputId, parentVersionId: input.id, mediaType: "image/png",
      pixels: new Uint8ClampedArray(preview.pixels), dataUrl: preview.dataUrl,
    };
    const operation: EditOperation = {
      id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id,
      type: "recolor", parameters: { color: preview.color }, method: "local", status: "accepted",
    };
    set({
      versions: [...state.versions, output], operations: [...state.operations, operation],
      maskAssets: [...state.maskAssets, preview.mask], currentVersionId: outputId, preview: null, error: null,
    });
    return true;
  },
  discardPreview: () => set({ preview: null, error: null }),
  reset: () => set((state) => {
    const original = state.versions.find((version) => version.id === state.originalVersionId);
    return original ? {
      currentVersionId: original.id, versions: [original], operations: [], maskAssets: [], preview: null,
      selectionMask: createMask(original.width, original.height), selectionId: crypto.randomUUID(),
      viewResetKey: state.viewResetKey + 1, error: null,
    } : {};
  }),
}));

/** Resolves the immutable image version currently displayed by the editor. */
export function getCurrentVersion(state: Pick<EditorState, "versions" | "currentVersionId">) {
  return state.versions.find((version) => version.id === state.currentVersionId) ?? null;
}
