import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageVersion, SourcePoint } from "./types";

vi.mock("./image-data", () => ({ pixelsToDataUrl: () => "data:image/png;base64,edited" }));
vi.mock("./generative-client", () => {
  class GenerativeRequestError extends Error {
    constructor(message: string, public readonly retryable: boolean) { super(message); }
  }
  return { GenerativeRequestError, requestGenerativeCandidate: vi.fn() };
});

import { useEditorStore } from "./store";
import { GenerativeRequestError, requestGenerativeCandidate } from "./generative-client";

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

describe("filled selection preview and acceptance", () => {
  beforeEach(() => {
    vi.mocked(requestGenerativeCandidate).mockReset();
    useEditorStore.getState().loadImage(original);
    useEditorStore.getState().setBrushSize(1);
    useEditorStore.getState().setMaskSoftness(0);
  });

  it("generative processing and preview do not advance history", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("remove");
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-1", diagnosticRequestId: "request-1", candidateAnalysis });
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
    vi.mocked(requestGenerativeCandidate).mockResolvedValue({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-2", diagnosticRequestId: "request-2", candidateAnalysis });
    await useEditorStore.getState().requestGenerativePreview();
    useEditorStore.getState().acceptPreview();
    const state = useEditorStore.getState();
    expect(state.versions).toHaveLength(2);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ type: "restyle", method: "generative", parameters: { prompt: "brushed copper", providerRequestId: "fake-2", diagnosticRequestId: "request-2", boundaryPolicy: "review", candidateAnalysis } });
  });

  it("retries an immutable snapshot after a retryable failure", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("remove");
    vi.mocked(requestGenerativeCandidate)
      .mockRejectedValueOnce(new GenerativeRequestError("temporary", true))
      .mockResolvedValueOnce({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:image/png;base64,candidate", providerRequestId: "fake-3", diagnosticRequestId: "request-3", candidateAnalysis });
    await useEditorStore.getState().requestGenerativePreview();
    const failedSnapshot = useEditorStore.getState().generativeState.snapshot!;
    expect(useEditorStore.getState().generativeState).toMatchObject({ status: "failed", retryable: true });
    await useEditorStore.getState().retryGenerativePreview();
    const retriedSnapshot = vi.mocked(requestGenerativeCandidate).mock.calls[1][0];
    expect(retriedSnapshot.inputVersion.pixels).toEqual(failedSnapshot.inputVersion.pixels);
    expect(retriedSnapshot.providerMask.data).toEqual(failedSnapshot.providerMask.data);
    expect(retriedSnapshot.boundaryPolicy).toBe("review");
    expect(useEditorStore.getState().generativeState.status).toBe("preview");
  });

  it("ignores a response superseded by a newer request", async () => {
    useEditorStore.getState().fillSelection(firstPixelContour);
    useEditorStore.getState().setEditType("remove");
    const resolvers: Array<(value: { pixels: Uint8ClampedArray; dataUrl: string; providerRequestId: string; diagnosticRequestId: string; candidateAnalysis: typeof candidateAnalysis }) => void> = [];
    vi.mocked(requestGenerativeCandidate).mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const older = useEditorStore.getState().requestGenerativePreview();
    const newer = useEditorStore.getState().requestGenerativePreview();
    resolvers[0]({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:old", providerRequestId: "old", diagnosticRequestId: "request-old", candidateAnalysis });
    expect(await older).toBe(false);
    expect(useEditorStore.getState().preview).toBeNull();
    resolvers[1]({ pixels: new Uint8ClampedArray(original.pixels), dataUrl: "data:new", providerRequestId: "new", diagnosticRequestId: "request-new", candidateAnalysis });
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
    accepted.setTool("eraser");
    accepted.paintSelection({ x: 0, y: 0 }, { x: 0, y: 0 });
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
    useEditorStore.getState().setTool("brush");
    useEditorStore.getState().paintSelection({ x: 2, y: 0 }, { x: 2, y: 0 });
    expect(useEditorStore.getState().preview).toBeNull();
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
