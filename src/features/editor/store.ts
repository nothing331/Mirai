import { create } from "zustand";
import { GenerativeRequestError, requestGenerativeCandidate } from "./generative-client";
import { pixelsToDataUrl } from "./image-data";
import { cleanRasterMask, unionMasks } from "./mask-cleanup";
import { createFullImageMask, createGenerativeProviderMask, createMask, fillPolygonMask, maskHasSelection, paintMask } from "./mask";
import { monochromePixels } from "./monochrome";
import { compositePaintOverlay, createPaintOverlay, paintOverlayMask, paintOverlayStroke } from "./paint";
import { recolorPixels } from "./recolor";
import { cleanLassoContour } from "./selection-geometry";
import type { EditBoundaryPolicy } from "@/shared/edit-boundary";
import type { EditOperation, EditPreview, EditType, FakeScenario, GenerativePreviewState, GenerativeRequestSnapshot, ImageVersion, LassoVisualization, MaskAsset, PaintSession, ProcessingMask, SelectionDiagnostics, SelectionMode, SourcePoint, Tool, TransformInput, Viewport } from "./types";

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
  boundaryPolicy: EditBoundaryPolicy;
  generativeState: GenerativePreviewState;
  selectionMask: ProcessingMask | null;
  selectionId: string | null;
  selectionMode: SelectionMode;
  selectionDiagnostics: SelectionDiagnostics | null;
  lassoVisualization: LassoVisualization | null;
  paintSession: PaintSession | null;
  viewport: Viewport;
  viewResetKey: number;
  tool: Tool;
  brushSize: number;
  maskSoftness: number;
  color: string;
  error: string | null;
  lastRequestId: string | null;
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
  setBoundaryPolicy: (policy: EditBoundaryPolicy) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  fillSelection: (points: SourcePoint[], viewportScale?: number) => void;
  refineSelection: (from: SourcePoint, to: SourcePoint) => void;
  clearSelection: () => void;
  applyPaintStroke: (points: SourcePoint[], erase?: boolean) => void;
  discardPaintSession: () => void;
  commitPaintSession: () => boolean;
  createPreview: () => boolean;
  requestGenerativePreview: () => Promise<boolean>;
  requestTransformPreview: (input: TransformInput) => Promise<boolean>;
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
  boundaryPolicy: "review" as EditBoundaryPolicy,
  selectionMode: "draw" as SelectionMode,
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
  preview: null,
  generativeState: idleGenerativeState,
  selectionMask: null,
  selectionId: null,
  selectionDiagnostics: null,
  lassoVisualization: null,
  paintSession: null,
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
    selectionDiagnostics: null,
    lassoVisualization: null,
    paintSession: null,
    viewResetKey: state.viewResetKey + 1,
    error: null,
    lastRequestId: null,
  })),
  restoreProject: (project) => {
    const current = project.versions.find((version) => version.id === project.currentVersionId);
    if (!current) return;
    set((state) => ({
      projectId: project.id,
      projectName: project.name,
      originalVersionId: project.originalVersionId,
      currentVersionId: project.currentVersionId,
      versions: project.versions,
      operations: project.operations,
      maskAssets: project.maskAssets,
      preview: null,
      generativeState: idleGenerativeState,
      lastRequestId: null,
      selectionMask: createMask(current.width, current.height),
      selectionId: crypto.randomUUID(),
      selectionDiagnostics: null,
      lassoVisualization: null,
      paintSession: null,
      viewResetKey: state.viewResetKey + 1,
      error: null,
    }));
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
  setBoundaryPolicy: (boundaryPolicy) => set({ boundaryPolicy, preview: null, generativeState: idleGenerativeState }),
  setSelectionMode: (selectionMode) => set({ selectionMode }),
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
        error: contour.usedRawContour && contour.selfIntersectionCount > 0 ? "The lasso crossed over itself, so the original contour was preserved. Refine it with Add or Subtract." : null,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The closed selection could not be filled." };
    }
  }),
  refineSelection: (from, to) => set((state) => state.selectionMask ? {
    selectionMask: paintMask(state.selectionMask, from, to, state.brushSize / 2, state.selectionMode === "subtract" ? 0 : 255, state.maskSoftness),
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
  applyPaintStroke: (points, erase = false) => set((state) => {
    if (points.length === 0 || !state.currentVersionId) return {};
    const current = state.versions.find((version) => version.id === state.currentVersionId);
    if (!current || (erase && !state.paintSession)) return {};
    const session = state.paintSession?.baseVersionId === current.id
      ? state.paintSession
      : { id: crypto.randomUUID(), baseVersionId: current.id, overlay: createPaintOverlay(current.width, current.height), colors: [], strokeCount: 0 };
    const overlay = paintOverlayStroke(session.overlay, points, state.brushSize / 2, state.maskSoftness, state.color, erase);
    const colors = erase || session.colors.includes(state.color) ? session.colors : [...session.colors, state.color];
    return {
      paintSession: { ...session, overlay, colors, strokeCount: session.strokeCount + 1 },
      preview: null,
      generativeState: idleGenerativeState,
      error: null,
    };
  }),
  discardPaintSession: () => set({ paintSession: null, error: null }),
  commitPaintSession: () => {
    const state = get();
    const session = state.paintSession;
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (!session || !input || session.baseVersionId !== input.id) {
      set({ paintSession: null, error: "There is no current paint to apply." });
      return false;
    }
    const selectionMask = paintOverlayMask(session.overlay);
    if (!maskHasSelection(selectionMask)) {
      set({ paintSession: null, error: null });
      return false;
    }
    const pixels = compositePaintOverlay(input, session.overlay);
    const mask: MaskAsset = { id: crypto.randomUUID(), ...selectionMask };
    set({
      preview: {
        id: crypto.randomUUID(), inputVersionId: input.id, type: "paint", method: "local",
        parameters: { colors: [...session.colors], strokeCount: session.strokeCount }, mask, pixels,
        dataUrl: pixelsToDataUrl(pixels, input.width, input.height),
      },
      error: null,
    });
    return get().acceptPreview();
  },
  createPreview: () => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (state.paintSession) {
      set({ error: "Apply or discard the pending paint before creating another edit." });
      return false;
    }
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
          id: crypto.randomUUID(), inputVersionId: input.id, type: "recolor", method: "local", parameters: { color: state.color }, mask,
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
    if (state.paintSession) {
      set({ error: "Apply or discard the pending paint before generating an edit." });
      return false;
    }
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
  requestTransformPreview: async (transformInput) => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (state.paintSession) {
      set({ error: "Apply or discard the pending paint before transforming the image." });
      return false;
    }
    const userPrompt = transformInput.userPrompt.trim();
    if (!input) {
      set({ error: "Open an image before transforming it." });
      return false;
    }
    if (!transformInput.presetId && !userPrompt) {
      set({ error: "Choose a transformation preset or describe a custom transformation." });
      return false;
    }
    const normalizedInput = { ...transformInput, userPrompt };
    const fullMask = createFullImageMask(input.width, input.height);
    if (normalizedInput.presetId === "monochrome" && userPrompt.length === 0) {
      const mask: MaskAsset = { id: crypto.randomUUID(), ...fullMask };
      const pixels = monochromePixels(input);
      set({
        preview: {
          id: crypto.randomUUID(), inputVersionId: input.id, type: "transform", method: "local",
          parameters: { ...normalizedInput, resolvedInstruction: "Deterministic monochrome luminance conversion." },
          mask, pixels, dataUrl: pixelsToDataUrl(pixels, input.width, input.height),
        },
        generativeState: idleGenerativeState,
        error: null,
      });
      return true;
    }
    const snapshot: GenerativeRequestSnapshot = {
      projectId: state.projectId!,
      requestId: crypto.randomUUID(),
      retryOfRequestId: null,
      inputVersion: { ...input, pixels: new Uint8ClampedArray(input.pixels) },
      providerMask: fullMask,
      operation: "transform",
      ...normalizedInput,
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
      ...input, id: outputId, parentVersionId: input.id, mediaType: "image/png",
      pixels: new Uint8ClampedArray(preview.pixels), dataUrl: preview.dataUrl,
    };
    const operation: EditOperation = preview.method === "generative"
      ? preview.type === "transform"
        ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "transform", parameters: preview.parameters, method: "generative", status: "accepted" }
        : { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: preview.type, parameters: preview.parameters, method: "generative", status: "accepted" }
      : preview.type === "paint"
        ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "paint", parameters: preview.parameters, method: "local", status: "accepted" }
        : preview.type === "transform"
          ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "transform", parameters: preview.parameters, method: "local", status: "accepted" }
          : { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "recolor", parameters: preview.parameters, method: "local", status: "accepted" };
    const inputIndex = state.versions.findIndex((version) => version.id === input.id);
    const retainedVersions = state.versions.slice(0, inputIndex + 1);
    const retainedVersionIds = new Set(retainedVersions.map((version) => version.id));
    const retainedOperations = state.operations.filter((item) => item.outputVersionId && retainedVersionIds.has(item.outputVersionId));
    const retainedMaskIds = new Set(retainedOperations.map((item) => item.maskId));
    const preserveSelection = preview.type === "paint";
    set({
      versions: [...retainedVersions, output], operations: [...retainedOperations, operation],
      maskAssets: [...state.maskAssets.filter((mask) => retainedMaskIds.has(mask.id)), preview.mask], currentVersionId: outputId, preview: null,
      selectionMask: preserveSelection ? state.selectionMask : createMask(input.width, input.height), selectionId: preserveSelection ? state.selectionId : crypto.randomUUID(),
      selectionDiagnostics: preserveSelection ? state.selectionDiagnostics : null, lassoVisualization: preserveSelection ? state.lassoVisualization : null,
      paintSession: null,
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
    set({ currentVersionId: target.id, preview: null, paintSession: null, generativeState: idleGenerativeState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), selectionDiagnostics: null, lassoVisualization: null, error: null });
    return true;
  },
  redo: () => {
    const state = get();
    const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
    if (currentIndex < 0 || currentIndex >= state.versions.length - 1) return false;
    const target = state.versions[currentIndex + 1];
    set({ currentVersionId: target.id, preview: null, paintSession: null, generativeState: idleGenerativeState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), selectionDiagnostics: null, lassoVisualization: null, error: null });
    return true;
  },
  reset: () => set((state) => {
    const original = state.versions.find((version) => version.id === state.originalVersionId);
    return original ? {
      currentVersionId: original.id, versions: [original], operations: [], maskAssets: [], preview: null, paintSession: null, generativeState: idleGenerativeState,
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
    let preview: EditPreview;
    if (snapshot.operation === "transform") {
      preview = {
        id: crypto.randomUUID(), inputVersionId: snapshot.inputVersion.id, type: "transform", method: "generative",
        parameters: {
          presetId: snapshot.presetId,
          presetVersion: snapshot.presetVersion,
          userPrompt: snapshot.userPrompt,
          preservationMode: snapshot.preservationMode,
          resolvedInstruction: candidate.resolvedInstruction ?? snapshot.userPrompt,
          providerRequestId: candidate.providerRequestId,
          diagnosticRequestId: candidate.diagnosticRequestId,
          candidateAnalysis: candidate.candidateAnalysis,
        },
        mask, pixels: candidate.pixels, dataUrl: candidate.dataUrl,
      };
    } else {
      preview = {
        id: crypto.randomUUID(), inputVersionId: snapshot.inputVersion.id, type: snapshot.operation, method: "generative",
        parameters: {
          prompt: snapshot.prompt,
          providerRequestId: candidate.providerRequestId,
          diagnosticRequestId: candidate.diagnosticRequestId,
          boundaryPolicy: snapshot.boundaryPolicy,
          candidateAnalysis: candidate.candidateAnalysis,
        },
        mask, pixels: candidate.pixels, dataUrl: candidate.dataUrl,
      };
    }
    useEditorStore.setState({
      preview,
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
