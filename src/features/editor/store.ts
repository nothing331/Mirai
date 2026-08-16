import { create } from "zustand";
import { GenerativeRequestError, requestGenerativeCandidate } from "./generative-client";
import { pixelsToDataUrl } from "./image-data";
import { cropPixels, flipPixels, resizePixels, rotatePixels } from "./local-transforms";
import { cleanRasterMask, unionMasks } from "./mask-cleanup";
import { createFullImageMask, createGenerativeProviderMask, createMask, fillPolygonMask, maskHasSelection, paintMask } from "./mask";
import { monochromePixels } from "./monochrome";
import { renderTextOverlay, renderWatermarkOverlay } from "./overlay-renderer";
import { compositePaintOverlay, createPaintOverlay, paintOverlayMask, paintOverlayStroke } from "./paint";
import { recolorPixels } from "./recolor";
import { cleanLassoContour } from "./selection-geometry";
import { blocksReplaceReviewAcceptance } from "@/shared/edit-boundary";
import { blocksTransformAcceptance, unavailableTransformFidelityAssessment } from "@/shared/transform-fidelity";
import { requestExtendCandidate, requestExtendPlan } from "./extend-client";
import type { EditBoundaryPolicy } from "@/shared/edit-boundary";
import type { ProjectOrigin } from "@/shared/asset-generation";
import { solveSmartReframe, type ExtendSceneAnalysis } from "@/shared/extend-plan";
import { getExtendPreset } from "@/shared/extend-presets";
import type { CropRatio, EditOperation, EditPreview, EditType, ExtendDraftState, ExtendInput, FakeScenario, GenerativePreviewState, GenerativeRequestSnapshot, GeometryEditType, ImageVersion, LassoVisualization, LocalEditDraft, MaskAsset, OverlayImageAsset, PaintSession, ProcessingMask, SelectionDiagnostics, SelectionMode, SourcePoint, Tool, TransformInput, Viewport } from "./types";

interface EditorState {
  originalVersionId: string | null;
  projectId: string | null;
  projectName: string;
  projectOrigin: ProjectOrigin;
  currentVersionId: string | null;
  versions: ImageVersion[];
  operations: EditOperation[];
  maskAssets: MaskAsset[];
  overlayAssets: OverlayImageAsset[];
  preview: EditPreview | null;
  localDraft: LocalEditDraft | null;
  localDraftDirty: boolean;
  editType: EditType;
  prompt: string;
  fakeScenario: FakeScenario;
  boundaryPolicy: EditBoundaryPolicy;
  generativeState: GenerativePreviewState;
  extendState: ExtendDraftState;
  extendAnalysisCache: Record<string, ExtendSceneAnalysis>;
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
  loadImage: (version: ImageVersion, options?: { projectId?: string; projectName?: string; projectOrigin?: ProjectOrigin; lastRequestId?: string | null }) => void;
  restoreProject: (project: { id: string; name: string; origin?: ProjectOrigin; originalVersionId: string; currentVersionId: string; versions: ImageVersion[]; operations: EditOperation[]; maskAssets: MaskAsset[]; overlayAssets?: OverlayImageAsset[] }) => void;
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
  beginLocalDraft: (type: GeometryEditType | "text" | "watermark") => void;
  updateLocalDraft: (draft: LocalEditDraft) => void;
  discardLocalDraft: () => void;
  addOverlayAsset: (asset: OverlayImageAsset) => void;
  applyLocalDraft: () => boolean;
  createPreview: () => boolean;
  requestGenerativePreview: () => Promise<boolean>;
  requestTransformPreview: (input: TransformInput) => Promise<boolean>;
  planExtend: (input: ExtendInput) => Promise<boolean>;
  generateExtend: () => Promise<boolean>;
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
const idleExtendState: ExtendDraftState = { status: "idle", input: null, analysis: null, plan: null, error: null };

function changedPixelMask(input: ImageVersion, outputPixels: Uint8ClampedArray): ProcessingMask {
  const mask = createMask(input.width, input.height);
  for (let pixel = 0; pixel < input.width * input.height; pixel += 1) {
    const channel = pixel * 4;
    if (
      input.pixels[channel] !== outputPixels[channel]
      || input.pixels[channel + 1] !== outputPixels[channel + 1]
      || input.pixels[channel + 2] !== outputPixels[channel + 2]
      || input.pixels[channel + 3] !== outputPixels[channel + 3]
    ) mask.data[pixel] = 255;
  }
  return mask;
}

function pixelsEqual(left: Uint8ClampedArray, right: Uint8ClampedArray) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function localDraftOperation(draft: LocalEditDraft, inputVersionId: string, outputVersionId: string, maskId: string): EditOperation {
  const base = { id: crypto.randomUUID(), inputVersionId, outputVersionId, maskId, method: "local" as const, status: "accepted" as const };
  switch (draft.type) {
    case "crop": return { ...base, type: "crop", parameters: draft.parameters };
    case "resize": return { ...base, type: "resize", parameters: draft.parameters };
    case "rotate": return { ...base, type: "rotate", parameters: draft.parameters };
    case "flip": return { ...base, type: "flip", parameters: draft.parameters };
    case "text": return { ...base, type: "text", parameters: draft.parameters };
    case "watermark": return { ...base, type: "watermark", parameters: draft.parameters };
  }
}

function appendAcceptedEdit(
  state: EditorState,
  input: ImageVersion,
  output: ImageVersion,
  operation: EditOperation,
  mask: MaskAsset,
  preserveSelection = false,
): Partial<EditorState> {
  const inputIndex = state.versions.findIndex((version) => version.id === input.id);
  const retainedVersions = state.versions.slice(0, inputIndex + 1);
  const retainedVersionIds = new Set(retainedVersions.map((version) => version.id));
  const retainedOperations = state.operations.filter((item) => item.outputVersionId && retainedVersionIds.has(item.outputVersionId));
  const retainedMaskIds = new Set(retainedOperations.map((item) => item.maskId));
  return {
    versions: [...retainedVersions, output],
    operations: [...retainedOperations, operation],
    maskAssets: [...state.maskAssets.filter((item) => retainedMaskIds.has(item.id)), mask],
    currentVersionId: output.id,
    preview: null,
    localDraft: null,
    localDraftDirty: false,
    selectionMask: preserveSelection ? state.selectionMask : createMask(output.width, output.height),
    selectionId: preserveSelection ? state.selectionId : crypto.randomUUID(),
    selectionDiagnostics: preserveSelection ? state.selectionDiagnostics : null,
    lassoVisualization: preserveSelection ? state.lassoVisualization : null,
    paintSession: null,
    generativeState: idleGenerativeState,
    extendState: idleExtendState,
    viewResetKey: state.viewResetKey + (input.width !== output.width || input.height !== output.height ? 1 : 0),
    error: null,
  };
}

/** Owns one filled source-resolution selection and separates previews from accepted history. */
export const useEditorStore = create<EditorState>((set, get) => ({
  originalVersionId: null,
  projectId: null,
  projectName: "Untitled edit",
  projectOrigin: { kind: "upload" },
  currentVersionId: null,
  versions: [],
  operations: [],
  maskAssets: [],
  overlayAssets: [],
  preview: null,
  localDraft: null,
  localDraftDirty: false,
  generativeState: idleGenerativeState,
  extendState: idleExtendState,
  extendAnalysisCache: {},
  selectionMask: null,
  selectionId: null,
  selectionDiagnostics: null,
  lassoVisualization: null,
  paintSession: null,
  ...initialControls,
  loadImage: (version, options) => set((state) => ({
    projectId: options?.projectId ?? crypto.randomUUID(),
    projectName: options?.projectName ?? "Untitled edit",
    projectOrigin: options?.projectOrigin ?? { kind: "upload" },
    originalVersionId: version.id,
    currentVersionId: version.id,
    versions: [version],
    operations: [],
    maskAssets: [],
    overlayAssets: [],
    preview: null,
    localDraft: null,
    localDraftDirty: false,
    generativeState: idleGenerativeState,
    extendState: idleExtendState,
    extendAnalysisCache: {},
    selectionMask: createMask(version.width, version.height),
    selectionId: crypto.randomUUID(),
    selectionDiagnostics: null,
    lassoVisualization: null,
    paintSession: null,
    viewResetKey: state.viewResetKey + 1,
    error: null,
    lastRequestId: options?.lastRequestId ?? null,
  })),
  restoreProject: (project) => {
    const current = project.versions.find((version) => version.id === project.currentVersionId);
    if (!current) return;
    set((state) => ({
      projectId: project.id,
      projectName: project.name,
      projectOrigin: project.origin ?? { kind: "upload" },
      originalVersionId: project.originalVersionId,
      currentVersionId: project.currentVersionId,
      versions: project.versions,
      operations: project.operations,
      maskAssets: project.maskAssets,
      overlayAssets: project.overlayAssets ?? [],
      preview: null,
      localDraft: null,
      localDraftDirty: false,
      generativeState: idleGenerativeState,
      extendState: idleExtendState,
      extendAnalysisCache: {},
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
    selectionMode: "draw",
    preview: null,
    generativeState: idleGenerativeState,
    selectionDiagnostics: null,
    lassoVisualization: null,
    error: null,
  } : {}),
  applyPaintStroke: (points, erase = false) => set((state) => {
    if (points.length === 0 || !state.currentVersionId || state.localDraft) return {};
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
        dataUrl: pixelsToDataUrl(pixels, input.width, input.height), width: input.width, height: input.height,
      },
      error: null,
    });
    return get().acceptPreview();
  },
  beginLocalDraft: (type) => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (!input) return;
    if (state.paintSession) {
      set({ error: "Apply or discard the pending paint before starting another local edit." });
      return;
    }
    const id = crypto.randomUUID();
    let localDraft: LocalEditDraft;
    if (type === "crop") localDraft = { id, inputVersionId: input.id, type, parameters: { sourceRect: { x: 0, y: 0, width: input.width, height: input.height }, ratio: "free" as CropRatio } };
    else if (type === "resize") localDraft = { id, inputVersionId: input.id, type, parameters: { width: input.width, height: input.height, preserveAspectRatio: true, preventUpscale: false } };
    else if (type === "rotate") localDraft = { id, inputVersionId: input.id, type, parameters: { quarterTurns: 1 } };
    else if (type === "flip") localDraft = { id, inputVersionId: input.id, type, parameters: { axis: "horizontal" } };
    else if (type === "text") localDraft = { id, inputVersionId: input.id, type, parameters: { content: "Your text", x: input.width * 0.15, y: input.height * 0.42, width: input.width * 0.7, fontFamily: "Manrope", fontSize: Math.max(18, Math.round(input.width * 0.07)), fontWeight: 700, color: "#ffffff", opacity: 1, rotation: 0, align: "center", backgroundColor: null, padding: Math.max(4, Math.round(input.width * 0.01)) } };
    else localDraft = { id, inputVersionId: input.id, type, parameters: { source: "text", content: "© Mirai", overlayAssetId: null, x: input.width * 0.68, y: input.height * 0.86, width: input.width * 0.26, fontFamily: "Manrope", fontSize: Math.max(12, Math.round(input.width * 0.028)), color: "#ffffff", opacity: 0.55, rotation: 0, anchor: "south-east", margin: Math.max(8, Math.round(input.width * 0.02)) } };
    set({ localDraft, localDraftDirty: type === "rotate" || type === "flip", preview: null, generativeState: idleGenerativeState, extendState: idleExtendState, error: null });
  },
  updateLocalDraft: (localDraft) => set((state) => state.currentVersionId === localDraft.inputVersionId ? { localDraft, localDraftDirty: true, error: null } : {}),
  discardLocalDraft: () => set({ localDraft: null, localDraftDirty: false, error: null }),
  addOverlayAsset: (asset) => set((state) => ({ overlayAssets: [...state.overlayAssets.filter((item) => item.id !== asset.id), asset] })),
  applyLocalDraft: () => {
    const state = get();
    const draft = state.localDraft;
    const input = state.versions.find((version) => version.id === draft?.inputVersionId);
    if (!draft || !input || state.currentVersionId !== draft.inputVersionId) {
      set({ localDraft: null, localDraftDirty: false, error: "The local edit is no longer based on the current image." });
      return false;
    }
    try {
      let rendered;
      if (draft.type === "crop") rendered = cropPixels(input, draft.parameters.sourceRect);
      else if (draft.type === "resize") {
        const scale = draft.parameters.preventUpscale ? Math.min(1, input.width / draft.parameters.width, input.height / draft.parameters.height) : 1;
        rendered = resizePixels(input, Math.max(1, Math.round(draft.parameters.width * scale)), Math.max(1, Math.round(draft.parameters.height * scale)));
      } else if (draft.type === "rotate") rendered = rotatePixels(input, draft.parameters.quarterTurns);
      else if (draft.type === "flip") rendered = flipPixels(input, draft.parameters.axis);
      else if (draft.type === "text") rendered = renderTextOverlay(input, draft.parameters);
      else rendered = renderWatermarkOverlay(input, draft.parameters, state.overlayAssets.find((asset) => asset.id === draft.parameters.overlayAssetId) ?? null);

      if (rendered.width === input.width && rendered.height === input.height && pixelsEqual(input.pixels, rendered.pixels)) {
        set({ error: "The local edit did not change any pixels." });
        return false;
      }

      const outputId = crypto.randomUUID();
      const output: ImageVersion = {
        ...input,
        id: outputId,
        parentVersionId: input.id,
        width: rendered.width,
        height: rendered.height,
        mediaType: "image/png",
        pixels: new Uint8ClampedArray(rendered.pixels),
        dataUrl: pixelsToDataUrl(rendered.pixels, rendered.width, rendered.height),
      };
      const effectiveMask = rendered.width === input.width && rendered.height === input.height && (draft.type === "text" || draft.type === "watermark")
        ? changedPixelMask(input, rendered.pixels)
        : createFullImageMask(input.width, input.height);
      const mask: MaskAsset = { id: crypto.randomUUID(), ...effectiveMask };
      const operation = localDraftOperation(draft, input.id, outputId, mask.id);
      set(appendAcceptedEdit(state, input, output, operation, mask));
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "The local edit could not be applied." });
      return false;
    }
  },
  createPreview: () => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (state.localDraft) {
      set({ error: "Apply or discard the current local edit before creating another edit." });
      return false;
    }
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
          pixels, dataUrl: pixelsToDataUrl(pixels, input.width, input.height), width: input.width, height: input.height,
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
    if (state.localDraft) {
      set({ error: "Apply or discard the current local edit before generating an edit." });
      return false;
    }
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
    if (state.localDraft) {
      set({ error: "Apply or discard the current local edit before transforming the image." });
      return false;
    }
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
          mask, pixels, dataUrl: pixelsToDataUrl(pixels, input.width, input.height), width: input.width, height: input.height,
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
  planExtend: async (extendInput) => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (!input || state.paintSession || state.localDraft) {
      set({ error: state.localDraft ? "Apply or discard the current local edit before extending the image." : state.paintSession ? "Apply or discard the pending paint before extending the image." : "Open an image before extending it." });
      return false;
    }
    const normalized: ExtendInput = { ...extendInput, userPrompt: extendInput.userPrompt.trim() };
    const cachedAnalysis = state.extendAnalysisCache[input.id] ?? null;
    if (cachedAnalysis) {
      const preset = getExtendPreset(normalized.presetId, normalized.presetVersion);
      if (!preset) {
        set({ error: "The selected Extend format is unavailable." });
        return false;
      }
      const plan = solveSmartReframe({ width: input.width, height: input.height, presetId: normalized.presetId, presetVersion: normalized.presetVersion, ratio: preset.ratio, strategy: normalized.strategy, analysis: cachedAnalysis });
      set({ extendState: { status: "planned", input: normalized, analysis: cachedAnalysis, plan, error: null }, preview: null, error: null });
      return true;
    }
    set({ extendState: { status: "analyzing", input: normalized, analysis: cachedAnalysis, plan: null, error: null }, preview: null, error: null });
    try {
      const result = await requestExtendPlan(input, normalized, cachedAnalysis, state.projectId!);
      if (get().currentVersionId !== input.id) return false;
      set((current) => ({ extendState: { status: "planned", input: normalized, analysis: result.analysis, plan: result.plan, error: null }, extendAnalysisCache: { ...current.extendAnalysisCache, [input.id]: result.analysis } }));
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Smart Reframe planning failed.";
      set({ extendState: { status: "failed", input: normalized, analysis: cachedAnalysis, plan: null, error: message }, error: message });
      return false;
    }
  },
  generateExtend: async () => {
    const state = get();
    const input = state.versions.find((version) => version.id === state.currentVersionId);
    if (!input || state.extendState.status !== "planned" || !state.projectId) return false;
    const draft = state.extendState;
    set({ extendState: { ...draft, status: "generating", phase: "sending" }, preview: null, error: null });
    try {
      const candidate = await requestExtendCandidate(input, draft.input, draft.analysis, draft.plan, state.projectId, (phase) => {
        const current = get();
        if (current.currentVersionId !== input.id || current.extendState.status !== "generating") return;
        set({ extendState: { ...current.extendState, phase } });
      });
      if (get().currentVersionId !== input.id) return false;
      const mask: MaskAsset = { id: crypto.randomUUID(), ...candidate.mask };
      set({
        preview: {
          id: crypto.randomUUID(), inputVersionId: input.id, type: "extend", method: "generative",
          parameters: { ...draft.input, plan: draft.plan, analysis: draft.analysis, resolvedInstruction: candidate.resolvedInstruction, providerRequestId: candidate.providerRequestId, diagnosticRequestId: candidate.diagnosticRequestId },
          mask, pixels: candidate.pixels, dataUrl: candidate.dataUrl, width: candidate.width, height: candidate.height,
        },
        extendState: { ...draft, status: "planned" },
        lastRequestId: candidate.diagnosticRequestId,
      });
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Image extension failed.";
      set({ extendState: { status: "failed", input: draft.input, analysis: draft.analysis, plan: draft.plan, error: message }, error: message });
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
    if (preview.method === "generative" && (preview.type === "remove" || preview.type === "replace" || preview.type === "restyle") && blocksReplaceReviewAcceptance(preview.type, preview.parameters.boundaryPolicy, preview.parameters.candidateAnalysis)) {
      set({ error: "This Replace proposal changed too much outside the selected target. Discard it and generate again, or use protected mode." });
      return false;
    }
    if (preview.method === "generative" && preview.type === "transform" && blocksTransformAcceptance(preview.parameters.preservationMode, preview.parameters.transformFidelityAssessment)) {
      set({ error: "This Transform proposal did not preserve the source subjects and composition closely enough. Discard it and generate again, or adjust the transformation settings." });
      return false;
    }
    const outputId = crypto.randomUUID();
    const output: ImageVersion = {
      ...input, id: outputId, parentVersionId: input.id, mediaType: "image/png", width: preview.width, height: preview.height,
      pixels: new Uint8ClampedArray(preview.pixels), dataUrl: preview.dataUrl,
    };
    const operation: EditOperation = preview.method === "generative"
      ? preview.type === "transform"
        ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "transform", parameters: preview.parameters, method: "generative", status: "accepted" }
        : preview.type === "extend"
          ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "extend", parameters: preview.parameters, method: "generative", status: "accepted" }
        : { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: preview.type, parameters: preview.parameters, method: "generative", status: "accepted" }
      : preview.type === "paint"
        ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "paint", parameters: preview.parameters, method: "local", status: "accepted" }
        : preview.type === "transform"
          ? { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "transform", parameters: preview.parameters, method: "local", status: "accepted" }
          : { id: crypto.randomUUID(), inputVersionId: input.id, outputVersionId: outputId, maskId: preview.mask.id, type: "recolor", parameters: preview.parameters, method: "local", status: "accepted" };
    const preserveSelection = preview.type === "paint";
    set(appendAcceptedEdit(state, input, output, operation, preview.mask, preserveSelection));
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
    set((current) => ({ currentVersionId: target.id, preview: null, localDraft: null, localDraftDirty: false, paintSession: null, generativeState: idleGenerativeState, extendState: idleExtendState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), selectionDiagnostics: null, lassoVisualization: null, viewResetKey: current.viewResetKey + 1, error: null }));
    return true;
  },
  redo: () => {
    const state = get();
    const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
    if (currentIndex < 0 || currentIndex >= state.versions.length - 1) return false;
    const target = state.versions[currentIndex + 1];
    set((current) => ({ currentVersionId: target.id, preview: null, localDraft: null, localDraftDirty: false, paintSession: null, generativeState: idleGenerativeState, extendState: idleExtendState, selectionMask: createMask(target.width, target.height), selectionId: crypto.randomUUID(), selectionDiagnostics: null, lassoVisualization: null, viewResetKey: current.viewResetKey + 1, error: null }));
    return true;
  },
  reset: () => set((state) => {
    const original = state.versions.find((version) => version.id === state.originalVersionId);
    return original ? {
      currentVersionId: original.id, versions: [original], operations: [], maskAssets: [], overlayAssets: [], preview: null, localDraft: null, localDraftDirty: false, paintSession: null, generativeState: idleGenerativeState,
      selectionMask: createMask(original.width, original.height), selectionId: crypto.randomUUID(), extendState: idleExtendState,
      extendAnalysisCache: {},
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
          transformFidelityAssessment: candidate.transformFidelityAssessment ?? unavailableTransformFidelityAssessment(),
        },
        mask, pixels: candidate.pixels, dataUrl: candidate.dataUrl, width: snapshot.inputVersion.width, height: snapshot.inputVersion.height,
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
        mask, pixels: candidate.pixels, dataUrl: candidate.dataUrl, width: snapshot.inputVersion.width, height: snapshot.inputVersion.height,
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
