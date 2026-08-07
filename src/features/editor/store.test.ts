import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageVersion, SourcePoint } from "./types";

vi.mock("./image-data", () => ({ pixelsToDataUrl: () => "data:image/png;base64,edited" }));
vi.mock("./generative-client", () => {
  class GenerativeRequestError extends Error {
    constructor(message: string, public readonly retryable: boolean) { super(message); }
  }
  return { GenerativeRequestError, requestGenerativeCandidate: vi.fn() };
});
vi.mock("./extend-client", () => ({ requestExtendPlan: vi.fn(), requestExtendCandidate: vi.fn() }));

import { useEditorStore } from "./store";
import { GenerativeRequestError, requestGenerativeCandidate } from "./generative-client";
import { requestExtendCandidate, requestExtendPlan } from "./extend-client";

const original: ImageVersion = {
  id: "original", parentVersionId: null, width: 3, height: 1, mediaType: "image/png",
  pixels: new Uint8ClampedArray([1, 2, 3, 255, 10, 20, 30, 255, 40, 50, 60, 255]),
  dataUrl: "data:image/png;base64,original",
};
const firstPixelContour: SourcePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const candidateAnalysis = {
  differenceThreshold: 12,
  changedPixels: 1,
  changedPixelRatio: 1 / 3,
  changedInsideSelectionPixels: 1,
  changedInsideSelectionRatio: 1,
  changedOutsideSelectionPixels: 0,
  changedOutsideSelectionRatio: 0,
  changedBoundaryPixels: 1,
  classification: "candidate-within-selection" as const,
  warnings: ["changes-touch-selection-boundary" as const],
};
const replaceScopeMismatchAnalysis = {
  ...candidateAnalysis,
  changedPixels: 3,
  changedPixelRatio: 1,
  changedOutsideSelectionPixels: 2,
  changedOutsideSelectionRatio: 1,
  classification: "replace-scope-mismatch" as const,
  warnings: ["changes-outside-selection" as const, "replace-scope-mismatch" as const],
};
const passingTransformAssessment = {
  verdict: "pass" as const,
  subjectPreservation: 1,
  compositionPreservation: 1,
  primarySubjectsMissing: [],
  unrelatedSubjectsAdded: [],
  compositionChanges: [],
  explanation: "Source semantics were retained.",
  confidence: "high" as const,
  validationAvailable: true,
};

describe("filled selection preview and acceptance", () => {
  beforeEach(() => {
    vi.mocked(requestGenerativeCandidate).mockReset();
    vi.mocked(requestExtendPlan).mockReset();
    vi.mocked(requestExtendCandidate).mockReset();
    useEditorStore.getState().loadImage(original);
    useEditorStore.getState().setBoundaryPolicy("review");
    useEditorStore.getState().setBrushSize(1);
    useEditorStore.getState().setMaskSoftness(0);
  });

  it("plans and accepts a dimension-changing Extend as one immutable edit", async () => {
    const analysis = {
      primarySubjects: [{ label: "subject", bounds: { x: 0.3, y: 0.1, width: 0.4, height: 0.8 }, importance: 1, touchesEdge: false, mustPreserve: true }],
      secondarySubjects: [], textRegions: [], horizonY: null, visualCenter: { x: 0.5, y: 0.5 }, negativeSpaceRegions: [],
      edgeContinuation: { top: "sky", right: "wall", bottom: "floor", left: "wall" }, confidence: 0.9, warnings: [],
    };
    const plan = {
      schemaVersion: 1 as const, strategy: "smart" as const, presetId: "instagram-classic" as const, presetVersion: 1 as const, inputWidth: 3, inputHeight: 1,
      sourceCrop: { x: 0, y: 0, width: 3, height: 1 }, sourcePlacement: { x: 1, y: 1, width: 3, height: 1 }, outputWidth: 4, outputHeight: 5,
      expansionInsets: { top: 1, right: 0, bottom: 3, left: 1 }, seamWidth: 1, cropAreaRatio: 0, generatedAreaRatio: 0.85, confidence: 0.9, rationale: ["Kept source"], warnings: [],
    };
    vi.mocked(requestExtendPlan).mockResolvedValue({ analysis, plan });
    vi.mocked(requestExtendCandidate).mockResolvedValue({
      id: "extend-candidate", parentVersionId: null, mediaType: "image/png", width: 4, height: 5, pixels: new Uint8ClampedArray(4 * 5 * 4), dataUrl: "data:image/png;base64,extend",
      mask: { width: 4, height: 5, data: new Uint8ClampedArray(20).fill(255) }, providerRequestId: "extend-provider", diagnosticRequestId: "extend-request", resolvedInstruction: "Extend scene",
    });
    const input = { presetId: "instagram-classic" as const, presetVersion: 1 as const, strategy: "smart" as const, userPrompt: "" };
    expect(await useEditorStore.getState().planExtend(input)).toBe(true);
    expect(useEditorStore.getState().versions).toHaveLength(1);
    expect(await useEditorStore.getState().generateExtend()).toBe(true);
    expect(useEditorStore.getState().preview).toMatchObject({ type: "extend", width: 4, height: 5 });

    expect(useEditorStore.getState().acceptPreview()).toBe(true);
    const state = useEditorStore.getState();
    expect(state.versions).toHaveLength(2);
    expect(state.versions[1]).toMatchObject({ width: 4, height: 5 });
    expect(state.operations[0]).toMatchObject({ type: "extend", method: "generative", parameters: { plan, providerRequestId: "extend-provider" } });
    expect(state.selectionMask).toMatchObject({ width: 4, height: 5 });
    expect(state.undo()).toBe(true);
    expect(useEditorStore.getState().selectionMask).toMatchObject({ width: 3, height: 1 });
  });

  it("generative processing and preview do not advance history", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("remove");
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-1", diagnosticRequestId: "request-1", candidateAnalysis, resolvedInstruction: null });
    expect(await useEditorStore.getState().requestGenerativePreview()).toBe(true);
    const state = useEditorStore.getState();
    expect(state.generativeState.status).toBe("preview");
    expect(state.versions).toHaveLength(1);
    expect(state.operations).toHaveLength(0);
    expect(state.preview?.method).toBe("generative");
  });

  it("accepts one generative preview as exactly one operation and version", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("restyle");
    useEditorStore.getState().setPrompt("brushed copper");
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-2", diagnosticRequestId: "request-2", candidateAnalysis, resolvedInstruction: null });
    await useEditorStore.getState().requestGenerativePreview();
    useEditorStore.getState().acceptPreview();
    const state = useEditorStore.getState();
    expect(state.versions).toHaveLength(2);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ type: "restyle", method: "generative", parameters: { prompt: "brushed copper", providerRequestId: "fake-2", diagnosticRequestId: "request-2", boundaryPolicy: "review", candidateAnalysis } });
  });

  it("previews and accepts plain Monochrome locally without a provider request", async () => {
    expect(await useEditorStore.getState().requestTransformPreview({ presetId: "monochrome", presetVersion: 1, userPrompt: "", preservationMode: "balanced" })).toBe(true);
    expect(requestGenerativeCandidate).not.toHaveBeenCalled();
    expect(useEditorStore.getState().preview).toMatchObject({ type: "transform", method: "local" });

    useEditorStore.getState().acceptPreview();
    const state = useEditorStore.getState();
    expect(state.versions).toHaveLength(2);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ type: "transform", method: "local", parameters: { presetId: "monochrome", presetVersion: 1 } });
    expect(state.maskAssets[0].data.every((alpha) => alpha === 255)).toBe(true);
  });

  it("captures and accepts a full-image generative Transform snapshot", async () => {
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({
      pixels: new Uint8ClampedArray(original.pixels),
      dataUrl: "data:image/png;base64,transform",
      providerRequestId: "fake-transform",
      diagnosticRequestId: "request-transform",
      candidateAnalysis,
      resolvedInstruction: "Resolved anime instruction",
      transformFidelityAssessment: passingTransformAssessment,
    });

    expect(await useEditorStore.getState().requestTransformPreview({ presetId: "anime", presetVersion: 1, userPrompt: "warm evening light", preservationMode: "faithful" })).toBe(true);
    const snapshot = vi.mocked(requestGenerativeCandidate).mock.calls[0][0];
    expect(snapshot).toMatchObject({ operation: "transform", presetId: "anime", preservationMode: "faithful" });
    expect(snapshot.providerMask.data.every((alpha) => alpha === 255)).toBe(true);

    useEditorStore.getState().acceptPreview();
    expect(useEditorStore.getState().operations[0]).toMatchObject({
      type: "transform",
      method: "generative",
      parameters: { presetId: "anime", userPrompt: "warm evening light", resolvedInstruction: "Resolved anime instruction", providerRequestId: "fake-transform" },
    });
  });

  it("preserves but blocks a Faithful Transform candidate with semantic drift", async () => {
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({
      pixels: new Uint8ClampedArray(original.pixels),
      dataUrl: "data:image/png;base64,transform-drift",
      providerRequestId: "fake-transform-drift",
      diagnosticRequestId: "request-transform-drift",
      candidateAnalysis,
      resolvedInstruction: "Resolved anime instruction",
      transformFidelityAssessment: {
        ...passingTransformAssessment,
        verdict: "block",
        subjectPreservation: 0,
        compositionPreservation: 0,
        primarySubjectsMissing: ["rocket"],
        unrelatedSubjectsAdded: ["person"],
        explanation: "The source rocket was replaced by an unrelated person.",
      },
    });

    await useEditorStore.getState().requestTransformPreview({ presetId: "anime", presetVersion: 1, userPrompt: "", preservationMode: "faithful" });

    expect(useEditorStore.getState().preview).not.toBeNull();
    expect(useEditorStore.getState().acceptPreview()).toBe(false);
    expect(useEditorStore.getState().versions).toHaveLength(1);
    expect(useEditorStore.getState().operations).toHaveLength(0);
    expect(useEditorStore.getState().error).toContain("did not preserve");
  });

  it("blocks a review-mode Replace scope mismatch without advancing history", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("replace");
    useEditorStore.getState().setPrompt("replace the selected strawberry with an orange");
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-scope", diagnosticRequestId: "request-scope", candidateAnalysis: replaceScopeMismatchAnalysis, resolvedInstruction: null });

    await useEditorStore.getState().requestGenerativePreview();

    expect(useEditorStore.getState().acceptPreview()).toBe(false);
    expect(useEditorStore.getState().preview).not.toBeNull();
    expect(useEditorStore.getState().versions).toHaveLength(1);
    expect(useEditorStore.getState().operations).toHaveLength(0);
    expect(useEditorStore.getState().error).toContain("changed too much outside");
  });

  it("allows a protected Replace composite even when its raw candidate has a scope mismatch", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("replace");
    useEditorStore.getState().setPrompt("replace the selected strawberry with an orange");
    useEditorStore.getState().setBoundaryPolicy("protected");
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-protected", diagnosticRequestId: "request-protected", candidateAnalysis: replaceScopeMismatchAnalysis, resolvedInstruction: null });

    await useEditorStore.getState().requestGenerativePreview();

    expect(useEditorStore.getState().acceptPreview()).toBe(true);
    expect(useEditorStore.getState().versions).toHaveLength(2);
    expect(useEditorStore.getState().operations).toHaveLength(1);
  });

  it("retries an immutable snapshot after a retryable failure", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("remove");
    vi.mocked(requestGenerativeCandidate)
      .mockRejectedValueOnce(new GenerativeRequestError("temporary", true))
      .mockResolvedValueOnce({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-3", diagnosticRequestId: "request-3", candidateAnalysis, resolvedInstruction: null });
    await useEditorStore.getState().requestGenerativePreview();
    const failedSnapshot = useEditorStore.getState().generativeState.snapshot!;
    expect(useEditorStore.getState().generativeState).toMatchObject({ status: "failed", retryable: true });
    await useEditorStore.getState().retryGenerativePreview();
    const retriedSnapshot = vi.mocked(requestGenerativeCandidate).mock.calls[1][0];
    expect(retriedSnapshot.inputVersion.pixels).toEqual(failedSnapshot.inputVersion.pixels);
    expect(retriedSnapshot.providerMask.data).toEqual(failedSnapshot.providerMask.data);
    expect(retriedSnapshot.operation === "transform" ? null : retriedSnapshot.boundaryPolicy).toBe("review");
    expect(useEditorStore.getState().generativeState.status).toBe("preview");
  });

  it("ignores a response superseded by a newer request", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("remove");
    const resolvers: Array<(value: { pixels: Uint8ClampedArray; dataUrl: string; providerRequestId: string; diagnosticRequestId: string; candidateAnalysis: typeof candidateAnalysis; resolvedInstruction: null }) => void> = [];
    vi.mocked(requestGenerativeCandidate).mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const older = useEditorStore.getState().requestGenerativePreview();
    const newer = useEditorStore.getState().requestGenerativePreview();
    resolvers[0]({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:old", providerRequestId: "old", diagnosticRequestId: "request-old", candidateAnalysis, resolvedInstruction: null });
    expect(await older).toBe(false);
    expect(useEditorStore.getState().preview).toBeNull();
    resolvers[1]({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:new", providerRequestId: "new", diagnosticRequestId: "request-new", candidateAnalysis, resolvedInstruction: null });
    expect(await newer).toBe(true);
    const preview = useEditorStore.getState().preview;
    expect(preview?.method === "generative" ? preview.parameters.providerRequestId : null).toBe("new");
  });

  it("does not create a preview for an empty selection", () => {
    expect(useEditorStore.getState().createPreview()).toBe(false);
    expect(useEditorStore.getState().versions).toHaveLength(1);
    expect(useEditorStore.getState().operations).toHaveLength(0);
  });

  it("fills a closed selection and leaves exterior pixels outside the mask", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    const mask = useEditorStore.getState().selectionMask!;
    expect(mask.data[0]).toBe(255);
    expect(mask.data[1]).toBe(0);
    expect(mask.data[2]).toBe(0);
  });

  it("records conservative lasso cleanup diagnostics", () => {
    useEditorStore.getState().fillSelection([
      { x: 0, y: 0 }, { x: 0.35, y: 0 }, { x: 0.7, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ], 4);
    const diagnostics = useEditorStore.getState().selectionDiagnostics;
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.cleanedPointCount).toBeLessThanOrEqual(diagnostics!.rawPointCount);
    expect(useEditorStore.getState().versions).toHaveLength(1);
  });

  it("preview and discard never advance accepted history", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    expect(useEditorStore.getState().createPreview()).toBe(true);
    expect(useEditorStore.getState().versions).toHaveLength(1);
    useEditorStore.getState().discardPreview();
    expect(useEditorStore.getState().preview).toBeNull();
    expect(useEditorStore.getState().currentVersionId).toBe("original");
  });

  it("accepting creates one operation, version, and immutable mask", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().createPreview();
    expect(useEditorStore.getState().acceptPreview()).toBe(true);
    const accepted = useEditorStore.getState();
    expect(accepted.versions).toHaveLength(2);
    expect(accepted.operations).toHaveLength(1);
    expect(accepted.maskAssets).toHaveLength(1);
    expect(accepted.selectionMask?.data.every((alpha) => alpha === 0)).toBe(true);
    const capturedMask = [...accepted.maskAssets[0].data];
    accepted.setSelectionMode("subtract");
    accepted.refineSelection({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect([...useEditorStore.getState().maskAssets[0].data]).toEqual(capturedMask);
  });

  it("recolors the filled interior but preserves exterior bytes", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setColor("#ff0000");
    useEditorStore.getState().createPreview();
    const pixels = useEditorStore.getState().preview!.pixels;
    expect([...pixels.slice(0, 4)]).not.toEqual([...original.pixels.slice(0, 4)]);
    expect([...pixels.slice(4)]).toEqual([...original.pixels.slice(4)]);
  });

  it("changing the mask invalidates its stale preview", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().createPreview();
    useEditorStore.getState().setSelectionMode("add");
    useEditorStore.getState().refineSelection({ x: 2, y: 0 }, { x: 2, y: 0 });
    expect(useEditorStore.getState().preview).toBeNull();
  });

  it("keeps brush and eraser gestures outside history until paint is applied", () => {
    useEditorStore.getState().setColor("#ff0000");
    useEditorStore.getState().applyPaintStroke([{ x: 0, y: 0 }]);
    useEditorStore.getState().applyPaintStroke([{ x: 2, y: 0 }]);
    useEditorStore.getState().applyPaintStroke([{ x: 2, y: 0 }], true);

    const pending = useEditorStore.getState();
    expect(pending.paintSession).toMatchObject({ colors: ["#ff0000"], strokeCount: 3 });
    expect(pending.versions).toHaveLength(1);
    expect(pending.operations).toHaveLength(0);
    expect(pending.paintSession!.overlay.pixels[3]).toBe(255);
    expect(pending.paintSession!.overlay.pixels[11]).toBe(0);
  });

  it("applies a paint session as exactly one immutable operation and version", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    const selectionBeforePaint = [...useEditorStore.getState().selectionMask!.data];
    useEditorStore.getState().setColor("#ff0000");
    useEditorStore.getState().applyPaintStroke([{ x: 0, y: 0 }]);
    useEditorStore.getState().applyPaintStroke([{ x: 1, y: 0 }]);

    expect(useEditorStore.getState().commitPaintSession()).toBe(true);
    const state = useEditorStore.getState();
    expect(state.paintSession).toBeNull();
    expect(state.versions).toHaveLength(2);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ type: "paint", method: "local", parameters: { colors: ["#ff0000"], strokeCount: 2 } });
    expect([...state.selectionMask!.data]).toEqual(selectionBeforePaint);
  });

  it("discards pending paint without changing pixels or history", () => {
    useEditorStore.getState().applyPaintStroke([{ x: 0, y: 0 }]);
    useEditorStore.getState().discardPaintSession();
    const state = useEditorStore.getState();
    expect(state.paintSession).toBeNull();
    expect(state.currentVersionId).toBe("original");
    expect(state.versions).toEqual([original]);
    expect(state.operations).toEqual([]);
  });

  it("blocks generation while paint is pending", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("remove");
    useEditorStore.getState().applyPaintStroke([{ x: 0, y: 0 }]);

    expect(await useEditorStore.getState().requestGenerativePreview()).toBe(false);
    expect(requestGenerativeCandidate).not.toHaveBeenCalled();
    expect(useEditorStore.getState().error).toContain("Apply or discard");
  });

  it("clears pending paint when immutable history moves", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().createPreview();
    useEditorStore.getState().acceptPreview();
    useEditorStore.getState().applyPaintStroke([{ x: 0, y: 0 }]);

    expect(useEditorStore.getState().undo()).toBe(true);
    expect(useEditorStore.getState().paintSession).toBeNull();
  });

  it("reset restores the original and clears the selection and history", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().createPreview();
    useEditorStore.getState().acceptPreview();
    useEditorStore.getState().reset();
    const state = useEditorStore.getState();
    expect(state.currentVersionId).toBe("original");
    expect(state.operations).toEqual([]);
    expect(state.maskAssets).toEqual([]);
    expect(state.selectionMask?.data.every((alpha) => alpha === 0)).toBe(true);
  });

  it("maps a reopened project's persisted identity into editor state", () => {
    useEditorStore.getState().restoreProject({
      id: "saved-project-id",
      name: "Saved project",
      originalVersionId: original.id,
      currentVersionId: original.id,
      versions: [original],
      operations: [],
      maskAssets: [],
    });

    expect(useEditorStore.getState()).toMatchObject({
      projectId: "saved-project-id",
      projectName: "Saved project",
      currentVersionId: original.id,
    });
  });

  it("undo and redo move only the current immutable version pointer", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().createPreview();
    useEditorStore.getState().acceptPreview();
    const acceptedId = useEditorStore.getState().currentVersionId;
    expect(useEditorStore.getState().undo()).toBe(true);
    expect(useEditorStore.getState().currentVersionId).toBe("original");
    expect(useEditorStore.getState().versions).toHaveLength(2);
    expect(useEditorStore.getState().redo()).toBe(true);
    expect(useEditorStore.getState().currentVersionId).toBe(acceptedId);
  });

  it("accepting after undo truncates the redo branch", () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().createPreview();
    useEditorStore.getState().acceptPreview();
    const abandonedId = useEditorStore.getState().currentVersionId;
    useEditorStore.getState().undo();
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setColor("#00ff00");
    useEditorStore.getState().createPreview();
    useEditorStore.getState().acceptPreview();
    const state = useEditorStore.getState();
    expect(state.versions).toHaveLength(2);
    expect(state.operations).toHaveLength(1);
    expect(state.versions.some((version) => version.id === abandonedId)).toBe(false);
    expect(state.canRedo()).toBe(false);
  });
});
