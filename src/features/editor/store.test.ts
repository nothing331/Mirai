import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageVersion, SourcePoint } from "./types";

vi.mock("./image-data", () => ({ pixelsToDataUrl: () => "data:image/png;base64,edited" }));

import { useEditorStore } from "./store";

const original: ImageVersion = {
  id: "original", parentVersionId: null, width: 3, height: 1, mediaType: "image/png",
  pixels: new Uint8ClampedArray([1, 2, 3, 255, 10, 20, 30, 255, 40, 50, 60, 255]),
  dataUrl: "data:image/png;base64,original",
};
const firstPixelContour: SourcePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

describe("filled selection preview and acceptance", () => {
  beforeEach(() => {
    useEditorStore.getState().loadImage(original);
    useEditorStore.getState().setBrushSize(1);
    useEditorStore.getState().setMaskSoftness(0);
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
});
