import { create } from "zustand";
import { GenerativeRequestError, requestGenerativeCandidate } from "./generative-client";
import { pixelsToDataUrl } from "./image-data";
import { cropPixels, flipPixels, resizePixels, rotatePixels } from "./local-transforms";
import { cleanRasterMask, unionMasks } from "./mask-cleanup";
import { createGenerativeProviderMask, createMask, fillPolygonMask, maskHasSelection, paintMask } from "./mask";
import { renderTextOverlay, renderWatermarkOverlay } from "./overlay-renderer";
import { recolorPixels } from "./recolor";
import { cleanLassoContour } from "./selection-geometry";
import type { EditBoundaryPolicy } from "@/shared/edit-boundary";
import type { CropRatio, EditOperation, EditPreview, EditType, EditorMode, FakeScenario, GenerativePreviewState, GenerativeRequestSnapshot, ImageVersion, LassoVisualization, LocalEditDraft, MaskAsset, OverlayImageAsset, ProcessingMask, SelectionDiagnostics, SourcePoint, Tool, TransformType, Viewport } from "./types";

interface EditorState {
  originalVersionId: string | null;
  projectId: string | null;
  projectName: string;
  currentVersionId: string | null;
  versions: ImageVersion[];
  operations: EditOperation[];
  maskAssets: MaskAsset[];
  overlayAssets: OverlayImageAsset[];
  preview: EditPreview | null;
  localDraft: LocalEditDraft | null;
  editorMode: EditorMode;
  transformType: TransformType;
  editType: EditType;
  prompt: string;
  fakeScenario: FakeScenario;
  boundaryPolicy: EditBoundaryPolicy;
  generativeState: GenerativePreviewState;
  selectionMask: ProcessingMask | null;
  selectionId: string | null;
  selectionDiagnostics: SelectionDiagnostics | null;
  lassoVisualization: LassoVisualization | null;
  viewport: Viewport;
  viewResetKey: number;
  tool: Tool;
  brushSize: number;
  maskSoftness: number;
  color: string;
  error: string | null;
  lastRequestId: string | null;
  loadImage: (version: ImageVersion) => void;
  restoreProject: (project: { id: string; name: string; originalVersionId: string; currentVersionId: string; versions: ImageVersion[]; operations: EditOperation[]; maskAssets: MaskAsset[]; overlayAssets?: OverlayImageAsset[] }) => void;
  setProjectName: (name: string) => void;
  setViewport: (viewport: Viewport) => void;
  requestViewReset: () => void;
  setTool: (tool: Tool) => void;
  setBrushSize: (size: number) => void;
  setMaskSoftness: (softness: number) => void;
  setColor: (color: string) => void;
  setError: (error: string | null) => void;
  setEditorMode: (mode: EditorMode) => void;
  beginLocalDraft: (type: TransformType | "text" | "watermark") => void;
  updateLocalDraft: (draft: LocalEditDraft) => void;
  cancelLocalDraft: () => void;
  createLocalPreview: () => boolean;
  addOverlayAsset: (asset: OverlayImageAsset) => void;
  setEditType: (editType: EditType) => void;
  setPrompt: (prompt: string) => void;
  setFakeScenario: (scenario: FakeScenario) => void;
  setBoundaryPolicy: (policy: EditBoundaryPolicy) => void;
  fillSelection: (points: SourcePoint[], viewportScale?: number) => void;
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
  editorMode: "ai" as EditorMode,
  transformType: "crop" as TransformType,
  editType: "recolor" as EditType,
  prompt: "",
  fakeScenario: "success" as FakeScenario,
  boundaryPolicy: "review" as EditBoundaryPolicy,
  error: null,
  lastRequestId: null,
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
  overlayAssets: [],
  preview: null,
  localDraft: null,
  generativeState: idleGenerativeState,
  selectionMask: null,
  selectionId: null,
  selectionDiagnostics: null,
  lassoVisualization: null,
  ...initialControls,
  loadImage: (version) => set((state) => ({
    projectId: crypto.randomUUID(),
    projectName: "Untitled edit",
    originalVersionId: version.id,
    currentVersionId: version.id,
    versions: [version],
    operations: [],
    maskAssets: [],
    overlayAssets: [],
    preview: null,
    localDraft: null,
    generativeState: idleGenerativeState,
    selectionMask: createMask(version.width, version.height),
    selectionId: crypto.randomUUID(),
    selectionDiagnostics: null,
    lassoVisualization: null,
    viewResetKey: state.viewResetKey + 1,
    error: null,
    lastRequestId: null,
  })),
  restoreProject: (project) => {
    const current = project.versions.find((version) => version.id === project.currentVersionId);
    if (!current) return;
    set((state) => ({ ...project, overlayAssets: project.overlayAssets ?? [], preview: null, localDraft: null, generativeState: idleGenerativeState, lastRequestId: null, selectionMask: createMask(current.width, current.height), selectionId: crypto.randomUUID(), selectionDiagnostics: null, lassoVisualization: null, viewResetKey: state.viewResetKey + 1, error: null }));
  },
  setProjectName: (projectName) => set({ projectName }),
  setViewport: (viewport) => set({ viewport }),
  requestViewReset: () => set((state) => ({ viewResetKey: state.viewResetKey + 1 })),
  setTool: (tool) => set({ tool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setMaskSoftness: (maskSoftness) => set({ maskSoftness }),
  setColor: (color) => set({ color, preview: null }),
  setError: (error) => set({ error }),
  setEditorMode: (editorMode) => set({ editorMode, localDraft: null, preview: null, error: null }),
  beginLocalDraft: (type) => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (!input) return;
    const id = crypto.randomUUID();
    let localDraft: LocalEditDraft;
    if (type === "crop") localDraft = { id, inputVersionId: input.id, type, parameters: { sourceRect: { x: 0, y: 0, width: input.width, height: input.height }, ratio: "free" as CropRatio } };
    else if (type === "resize") localDraft = { id, inputVersionId: input.id, type, parameters: { width: input.width, height: input.height, preserveAspectRatio: true, preventUpscale: false } };
    else if (type === "rotate") localDraft = { id, inputVersionId: input.id, type, parameters: { quarterTurns: 1 } };
    else if (type === "flip") localDraft = { id, inputVersionId: input.id, type, parameters: { axis: "horizontal" } };
    else if (type === "text") localDraft = { id, inputVersionId: input.id, type, parameters: { content: "Your text", x: input.width * 0.15, y: input.height * 0.42, width: input.width * 0.7, fontFamily: "Manrope", fontSize: Math.max(18, Math.round(input.width * 0.07)), fontWeight: 700, color: "#ffffff", opacity: 1, rotation: 0, align: "center", backgroundColor: null, padding: 12 } };
    else localDraft = { id, inputVersionId: input.id, type, parameters: { source: "text", content: "© Mirai", overlayAssetId: null, x: input.width * 0.68, y: input.height * 0.86, width: input.width * 0.26, fontFamily: "Manrope", fontSize: Math.max(12, Math.round(input.width * 0.028)), color: "#ffffff", opacity: 0.55, rotation: 0, anchor: "south-east", margin: Math.max(8, Math.round(input.width * 0.02)) } };
    set({ localDraft, transformType: type === "text" || type === "watermark" ? state.transformType : type, preview: null, error: null });
  },
  updateLocalDraft: (localDraft) => set((state) => state.currentVersionId === localDraft.inputVersionId ? { localDraft, preview: null, error: null } : {}),
  cancelLocalDraft: () => set({ localDraft: null, preview: null, error: null }),
  addOverlayAsset: (asset) => set((state) => ({ overlayAssets: [...state.overlayAssets.filter((item) => item.id !== asset.id), asset] })),
  createLocalPreview: () => {
    const state = get();
    const draft = state.localDraft;
    const input = state.versions.find((version) => version.id === draft?.inputVersionId);
    if (!draft || !input || state.currentVersionId !== draft.inputVersionId) {
      set({ error: "Start a local edit before reviewing it." });
      return false;
    }
    try {
      let rendered;
      if (draft.type === "crop") rendered = cropPixels(input, draft.parameters.sourceRect);
      else if (draft.type === "resize") {
        const scale = draft.parameters.preventUpscale ? Math.min(1, input.width / draft.parameters.width, input.height / draft.parameters.height) : 1;
        const width = Math.max(1, Math.round(draft.parameters.width * scale));
        const height = Math.max(1, Math.round(draft.parameters.height * scale));
        rendered = resizePixels(input, width, height);
      } else if (draft.type === "rotate") rendered = rotatePixels(input, draft.parameters.quarterTurns);
      else if (draft.type === "flip") rendered = flipPixels(input, draft.parameters.axis);
      else if (draft.type === "text") rendered = renderTextOverlay(input, draft.parameters);
      else rendered = renderWatermarkOverlay(input, draft.parameters, state.overlayAssets.find((asset) => asset.id === draft.parameters.overlayAssetId) ?? null);
      set({
        preview: { id: crypto.randomUUID(), inputVersionId: input.id, selectionId: null, mask: null, width: rendered.width, height: rendered.height, pixels: rendered.pixels, dataUrl: pixelsToDataUrl(rendered.pixels, rendered.width, rendered.height), type: draft.type, method: "local", parameters: draft.parameters } as EditPreview,
        error: null,
      });
      return true;
    } catch (error) {
      set({ preview: null, error: error instanceof Error ? error.message : "The local preview could not be created." });
      return false;
    }
  },
  setEditType: (editType) => set({ editType, preview: null, generativeState: idleGenerativeState, error: null }),
  setPrompt: (prompt) => set({ prompt, preview: null, generativeState: idleGenerativeState }),
  setFakeScenario: (fakeScenario) => set({ fakeScenario }),
  setBoundaryPolicy: (boundaryPolicy) => set({ boundaryPolicy, preview: null, generativeState: idleGenerativeState }),
  fillSelection: (points, viewportScale = 1) => set((state) => {
    if (!state.selectionMask) return {};
    try {
      const contour = cleanLassoContour(points, viewportScale);
      const softnessPixels = state.brushSize * state.maskSoftness;
      const empty = createMask(state.selectionMask.width, state.selectionMask.height);
      const featheredMask = fillPolygonMask(empty, contour.points, softnessPixels);
      const binaryMask = fillPolygonMask(empty, contour.points, 0);
      const radius = Math.min(4, Math.max(1, Math.round(Math.min(empty.width, empty.height) * 0.002)));
      const minimumIslandArea = Math.max(1, Math.round(empty.width * empty.height * 0.00001));
      const cleanedBinaryMask = cleanRasterMask(binaryMask, radius, minimumIslandArea);
      const cleanedMask = createMask(empty.width, empty.height);
      for (let index = 0; index < cleanedMask.data.length; index += 1) {
        if (cleanedBinaryMask.data[index] === 0) continue;
        cleanedMask.data[index] = binaryMask.data[index] === 0 ? 255 : featheredMask.data[index];
      }
      const warnings: SelectionDiagnostics["warnings"] = [];
      if (contour.selfIntersectionCount > 0) warnings.push("self-intersection");
      if (contour.areaChangeRatio > 0.06) warnings.push("large-auto-correction");
      if (contour.usedRawContour) warnings.push("raw-contour-preserved");
      return {
        selectionMask: unionMasks(state.selectionMask, cleanedMask),
        selectionDiagnostics: {
          rawPointCount: contour.rawPoints.length,
          cleanedPointCount: contour.points.length,
          removedSpikeCount: contour.removedSpikeCount,
          selfIntersectionCount: contour.selfIntersectionCount,
          areaChangeRatio: contour.areaChangeRatio,
          warnings,
        },
        lassoVisualization: { rawPoints: contour.rawPoints, cleanedPoints: contour.points, showRawContour: warnings.length > 0 },
        preview: null,
        generativeState: idleGenerativeState,
        error: contour.usedRawContour && contour.selfIntersectionCount > 0 ? "The lasso crossed over itself, so the original contour was preserved. Refine it with Brush or Eraser." : null,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The closed selection could not be filled." };
    }
  }),
  paintSelection: (from, to) => set((state) => state.selectionMask ? {
    selectionMask: paintMask(state.selectionMask, from, to, state.brushSize / 2, state.tool === "eraser" ? 0 : 255, state.maskSoftness),
    preview: null,
    generativeState: idleGenerativeState,
    lassoVisualization: null,
    error: null,
  } : {}),
  clearSelection: () => set((state) => state.selectionMask ? {
    selectionMask: createMask(state.selectionMask.width, state.selectionMask.height),
    selectionId: crypto.randomUUID(),
    preview: null,
    generativeState: idleGenerativeState,
    selectionDiagnostics: null,
    lassoVisualization: null,
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
          width: input.width, height: input.height, pixels, dataUrl: pixelsToDataUrl(pixels, input.width, input.height),
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
    if ((state.editType !== "remove" && state.editType !== "replace" && state.editType !== "restyle") || !input || !state.selectionMask || !state.selectionId || !maskHasSelection(state.selectionMask)) {
      set({ error: "Draw a closed selection and choose a generative operation." });
      return false;
    }
    if (state.editType !== "remove" && state.prompt.trim().length === 0) {
      set({ error: "Describe the requested change." });
      return false;
    }
    const snapshot: GenerativeRequestSnapshot = {
      projectId: state.projectId!,
      requestId: crypto.randomUUID(),
      retryOfRequestId: null,
      inputVersion: { ...input, pixels: new Uint8ClampedArray(input.pixels) },
      selectionId: state.selectionId,
      selectionMask: { width: state.selectionMask.width, height: state.selectionMask.height, data: new Uint8ClampedArray(state.selectionMask.data) },
      providerMask: createGenerativeProviderMask(state.selectionMask, state.editType),
      boundaryPolicy: state.boundaryPolicy,
      operation: state.editType,
      prompt: state.prompt.trim(),
      scenario: state.fakeScenario,
    };
    return executeGenerativeRequest(snapshot);
  },
  retryGenerativePreview: async () => {
    const state = get();
    if (state.generativeState.status !== "failed" || !state.generativeState.retryable) return false;
    return executeGenerativeRequest({
      ...state.generativeState.snapshot,
      requestId: crypto.randomUUID(),
      retryOfRequestId: state.generativeState.snapshot.requestId,
    });
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
      ...input, id: outputId, parentVersionId: input.id, width: preview.width, height: preview.height, mediaType: "image/png",
      pixels: new Uint8ClampedArray(preview.pixels), dataUrl: preview.dataUrl,
    };
    const operation = { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask?.id ?? null, type: preview.type, parameters: preview.parameters, method: preview.method, status: "accepted" } as EditOperation;
    const inputIndex = state.versions.findIndex((version) => version.id === input.id);
    const retainedVersions = state.versions.slice(0, inputIndex + 1);
    const retainedVersionIds = new Set(retainedVersions.map((version) => version.id));
    const retainedOperations = state.operations.filter((item) => item.outputVersionId && retainedVersionIds.has(item.outputVersionId));
    const retainedMaskIds = new Set(retainedOperations.map((item) => item.maskId).filter(Boolean));
    set({
      versions: [...retainedVersions, output], operations: [...retainedOperations, operation],
      maskAssets: [...state.maskAssets.filter((mask) => retainedMaskIds.has(mask.id)), ...(preview.mask ? [preview.mask] : [])], currentVersionId: outputId, preview: null, localDraft: null,
      selectionMask: createMask(output.width, output.height), selectionId: crypto.randomUUID(), viewResetKey: state.viewResetKey + (output.width !== input.width || output.height !== input.height ? 1 : 0),
      selectionDiagnostics: null, lassoVisualization: null,
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
    set((current) => ({ currentVersionId: target.id, preview: null, localDraft: null, generativeState: idleGenerativeState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), selectionDiagnostics: null, lassoVisualization: null, viewResetKey: current.viewResetKey + 1, error: null }));
    return true;
  },
  redo: () => {
    const state = get();
    const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
    if (currentIndex < 0 || currentIndex >= state.versions.length - 1) return false;
    const target = state.versions[currentIndex + 1];
    set((current) => ({ currentVersionId: target.id, preview: null, localDraft: null, generativeState: idleGenerativeState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), selectionDiagnostics: null, lassoVisualization: null, viewResetKey: current.viewResetKey + 1, error: null }));
    return true;
  },
  reset: () => set((state) => {
    const original = state.versions.find((version) => version.id === state.originalVersionId);
    return original ? {
      currentVersionId: original.id, versions: [original], operations: [], maskAssets: [], overlayAssets: [], preview: null, localDraft: null, generativeState: idleGenerativeState,
      selectionMask: createMask(original.width, original.height), selectionId: crypto.randomUUID(),
      selectionDiagnostics: null, lassoVisualization: null,
      viewResetKey: state.viewResetKey + 1, error: null,
    } : {};
  }),
}));

/** Executes an immutable request snapshot and ignores responses superseded by a newer request. */
async function executeGenerativeRequest(snapshot: GenerativeRequestSnapshot): Promise<boolean> {
  useEditorStore.setState({ generativeState: { status: "processing", snapshot, error: null, retryable: false }, lastRequestId: snapshot.requestId, preview: null, error: null });
  try {
    const candidate = await requestGenerativeCandidate(snapshot);
    const state = useEditorStore.getState();
    if (state.generativeState.snapshot?.requestId !== snapshot.requestId) return false;
    const mask: MaskAsset = { id: crypto.randomUUID(), width: snapshot.providerMask.width, height: snapshot.providerMask.height, data: new Uint8ClampedArray(snapshot.providerMask.data) };
    useEditorStore.setState({
      preview: {
        id: crypto.randomUUID(), inputVersionId: snapshot.inputVersion.id, selectionId: snapshot.selectionId,
        type: snapshot.operation, method: "generative", parameters: {
          prompt: snapshot.prompt,
          providerRequestId: candidate.providerRequestId,
          diagnosticRequestId: candidate.diagnosticRequestId,
          boundaryPolicy: snapshot.boundaryPolicy,
          candidateAnalysis: candidate.candidateAnalysis,
        },
        mask, width: snapshot.inputVersion.width, height: snapshot.inputVersion.height, pixels: candidate.pixels, dataUrl: candidate.dataUrl,
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
