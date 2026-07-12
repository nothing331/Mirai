import { create } from "zustand";
import { GenerativeRequestError, requestGenerativeCandidate } from "./generative-client";
import { pixelsToDataUrl } from "./image-data";
import { createMask, fillPolygonMask, maskHasSelection, paintMask } from "./mask";
import { recolorPixels } from "./recolor";
import type { EditOperation, EditPreview, EditType, FakeScenario, GenerativePreviewState, GenerativeRequestSnapshot, ImageVersion, MaskAsset, ProcessingMask, SourcePoint, Tool, Viewport } from "./types";

interface EditorState {
  originalVersionId: string | null;
  projectId: string | null;
  projectName: string;
  currentVersionId: string | null;
  versions: ImageVersion[];
  operations: EditOperation[];
  maskAssets: MaskAsset[];
  preview: EditPreview | null;
  editType: EditType;
  prompt: string;
  fakeScenario: FakeScenario;
  generativeState: GenerativePreviewState;
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
  restoreProject: (project: { id: string; name: string; originalVersionId: string; currentVersionId: string; versions: ImageVersion[]; operations: EditOperation[]; maskAssets: MaskAsset[] }) => void;
  setProjectName: (name: string) => void;
  setViewport: (viewport: Viewport) => void;
  requestViewReset: () => void;
  setTool: (tool: Tool) => void;
  setBrushSize: (size: number) => void;
  setMaskSoftness: (softness: number) => void;
  setColor: (color: string) => void;
  setError: (error: string | null) => void;
  setEditType: (editType: EditType) => void;
  setPrompt: (prompt: string) => void;
  setFakeScenario: (scenario: FakeScenario) => void;
  fillSelection: (points: SourcePoint[]) => void;
  paintSelection: (from: SourcePoint, to: SourcePoint) => void;
  clearSelection: () => void;
  createPreview: () => boolean;
  requestGenerativePreview: () => Promise<boolean>;
  retryGenerativePreview: () => Promise<boolean>;
  acceptPreview: () => boolean;
  discardPreview: () => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
}

const initialControls = {
  viewport: { x: 0, y: 0, scale: 1 },
  viewResetKey: 0,
  tool: "lasso" as Tool,
  brushSize: 40,
  maskSoftness: 0.2,
  color: "#ef4b32",
  editType: "recolor" as EditType,
  prompt: "",
  fakeScenario: "success" as FakeScenario,
  error: null,
};

const idleGenerativeState: GenerativePreviewState = { status: "idle", snapshot: null, error: null, retryable: false };

/** Owns one filled source-resolution selection and separates previews from accepted history. */
export const useEditorStore = create<EditorState>((set, get) => ({
  originalVersionId: null,
  projectId: null,
  projectName: "Untitled edit",
  currentVersionId: null,
  versions: [],
  operations: [],
  maskAssets: [],
  preview: null,
  generativeState: idleGenerativeState,
  selectionMask: null,
  selectionId: null,
  ...initialControls,
  loadImage: (version) => set((state) => ({
    projectId: crypto.randomUUID(),
    projectName: "Untitled edit",
    originalVersionId: version.id,
    currentVersionId: version.id,
    versions: [version],
    operations: [],
    maskAssets: [],
    preview: null,
    generativeState: idleGenerativeState,
    selectionMask: createMask(version.width, version.height),
    selectionId: crypto.randomUUID(),
    viewResetKey: state.viewResetKey + 1,
    error: null,
  })),
  restoreProject: (project) => {
    const current = project.versions.find((version) => version.id === project.currentVersionId);
    if (!current) return;
    set((state) => ({ ...project, preview: null, generativeState: idleGenerativeState, selectionMask: createMask(current.width, current.height), selectionId: crypto.randomUUID(), viewResetKey: state.viewResetKey + 1, error: null }));
  },
  setProjectName: (projectName) => set({ projectName }),
  setViewport: (viewport) => set({ viewport }),
  requestViewReset: () => set((state) => ({ viewResetKey: state.viewResetKey + 1 })),
  setTool: (tool) => set({ tool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setMaskSoftness: (maskSoftness) => set({ maskSoftness }),
  setColor: (color) => set({ color, preview: null }),
  setError: (error) => set({ error }),
  setEditType: (editType) => set({ editType, preview: null, generativeState: idleGenerativeState, error: null }),
  setPrompt: (prompt) => set({ prompt, preview: null, generativeState: idleGenerativeState }),
  setFakeScenario: (fakeScenario) => set({ fakeScenario }),
  fillSelection: (points) => set((state) => {
    if (!state.selectionMask) return {};
    try {
      const softnessPixels = state.brushSize * state.maskSoftness;
      return { selectionMask: fillPolygonMask(state.selectionMask, points, softnessPixels), preview: null, generativeState: idleGenerativeState, error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The closed selection could not be filled." };
    }
  }),
  paintSelection: (from, to) => set((state) => state.selectionMask ? {
    selectionMask: paintMask(state.selectionMask, from, to, state.brushSize / 2, state.tool === "eraser" ? 0 : 255, state.maskSoftness),
    preview: null,
    generativeState: idleGenerativeState,
    error: null,
  } : {}),
  clearSelection: () => set((state) => state.selectionMask ? {
    selectionMask: createMask(state.selectionMask.width, state.selectionMask.height),
    selectionId: crypto.randomUUID(),
    preview: null,
    generativeState: idleGenerativeState,
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
          id: crypto.randomUUID(), inputVersionId: input.id, selectionId: state.selectionId, type: "recolor", method: "local", parameters: { color: state.color }, mask,
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
  requestGenerativePreview: async () => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if ((state.editType !== "remove" && state.editType !== "restyle") || !input || !state.selectionMask || !state.selectionId || !maskHasSelection(state.selectionMask)) {
      set({ error: "Draw a closed selection and choose Remove or Restyle." });
      return false;
    }
    if (state.editType === "restyle" && state.prompt.trim().length === 0) {
      set({ error: "Describe how the selected area should be restyled." });
      return false;
    }
    const snapshot: GenerativeRequestSnapshot = {
      requestId: crypto.randomUUID(),
      inputVersion: { ...input, pixels: new Uint8ClampedArray(input.pixels) },
      selectionId: state.selectionId,
      mask: { ...state.selectionMask, data: new Uint8ClampedArray(state.selectionMask.data) },
      operation: state.editType,
      prompt: state.prompt.trim(),
      scenario: state.fakeScenario,
    };
    return executeGenerativeRequest(snapshot);
  },
  retryGenerativePreview: async () => {
    const state = get();
    if (state.generativeState.status !== "failed" || !state.generativeState.retryable) return false;
    return executeGenerativeRequest({ ...state.generativeState.snapshot, requestId: crypto.randomUUID() });
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
    const operation: EditOperation = preview.method === "local"
      ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "recolor", parameters: preview.parameters, method: "local", status: "accepted" }
      : { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: preview.type, parameters: preview.parameters, method: "generative", status: "accepted" };
    const inputIndex = state.versions.findIndex((version) => version.id === input.id);
    const retainedVersions = state.versions.slice(0, inputIndex + 1);
    const retainedVersionIds = new Set(retainedVersions.map((version) => version.id));
    const retainedOperations = state.operations.filter((item) => item.outputVersionId && retainedVersionIds.has(item.outputVersionId));
    const retainedMaskIds = new Set(retainedOperations.map((item) => item.maskId));
    set({
      versions: [...retainedVersions, output], operations: [...retainedOperations, operation],
      maskAssets: [...state.maskAssets.filter((mask) => retainedMaskIds.has(mask.id)), preview.mask], currentVersionId: outputId, preview: null,
      selectionMask: createMask(input.width, input.height), selectionId: crypto.randomUUID(),
      generativeState: idleGenerativeState, error: null,
    });
    return true;
  },
  discardPreview: () => set({ preview: null, generativeState: idleGenerativeState, error: null }),
  canUndo: () => {
    const state = get();
    return state.currentVersionId !== null && state.currentVersionId !== state.originalVersionId;
  },
  canRedo: () => {
    const state = get();
    const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
    return currentIndex >= 0 && currentIndex < state.versions.length - 1;
  },
  undo: () => {
    const state = get();
    const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
    if (currentIndex <= 0) return false;
    const target = state.versions[currentIndex - 1];
    set({ currentVersionId: target.id, preview: null, generativeState: idleGenerativeState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), error: null });
    return true;
  },
  redo: () => {
    const state = get();
    const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
    if (currentIndex < 0 || currentIndex >= state.versions.length - 1) return false;
    const target = state.versions[currentIndex + 1];
    set({ currentVersionId: target.id, preview: null, generativeState: idleGenerativeState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), error: null });
    return true;
  },
  reset: () => set((state) => {
    const original = state.versions.find((version) => version.id === state.originalVersionId);
    return original ? {
      currentVersionId: original.id, versions: [original], operations: [], maskAssets: [], preview: null, generativeState: idleGenerativeState,
      selectionMask: createMask(original.width, original.height), selectionId: crypto.randomUUID(),
      viewResetKey: state.viewResetKey + 1, error: null,
    } : {};
  }),
}));

/** Executes an immutable request snapshot and ignores responses superseded by a newer request. */
async function executeGenerativeRequest(snapshot: GenerativeRequestSnapshot): Promise<boolean> {
  useEditorStore.setState({ generativeState: { status: "processing", snapshot, error: null, retryable: false }, preview: null, error: null });
  try {
    const candidate = await requestGenerativeCandidate(snapshot);
    const state = useEditorStore.getState();
    if (state.generativeState.snapshot?.requestId !== snapshot.requestId) return false;
    const mask: MaskAsset = { id: crypto.randomUUID(), width: snapshot.mask.width, height: snapshot.mask.height, data: new Uint8ClampedArray(snapshot.mask.data) };
    useEditorStore.setState({
      preview: {
        id: crypto.randomUUID(), inputVersionId: snapshot.inputVersion.id, selectionId: snapshot.selectionId,
        type: snapshot.operation, method: "generative", parameters: { prompt: snapshot.prompt, providerRequestId: candidate.providerRequestId },
        mask, pixels: candidate.pixels, dataUrl: candidate.dataUrl,
      },
      generativeState: { status: "preview", snapshot, error: null, retryable: false },
    });
    return true;
  } catch (error) {
    const state = useEditorStore.getState();
    if (state.generativeState.snapshot?.requestId !== snapshot.requestId) return false;
    const retryable = error instanceof GenerativeRequestError && error.retryable;
    const message = error instanceof Error ? error.message : "Generative editing failed.";
    useEditorStore.setState({ generativeState: { status: "failed", snapshot, error: message, retryable }, error: message });
    return false;
  }
}

/** Resolves the immutable image version currently displayed by the editor. */
export function getCurrentVersion(state: Pick<EditorState, "versions" | "currentVersionId">) {
  return state.versions.find((version) => version.id === state.currentVersionId) ?? null;
}
