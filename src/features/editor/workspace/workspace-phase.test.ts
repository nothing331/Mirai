import { describe, expect, it } from "vitest";
import { createMask } from "../mask";
import type { EditPreview, GenerativePreviewState } from "../types";
import { deriveWorkspacePhase } from "./workspace-phase";

const idle: GenerativePreviewState = { status: "idle", snapshot: null, error: null, retryable: false };

describe("workspace phase", () => {
  it("keeps an empty workspace distinct from a loaded image", () => {
    expect(deriveWorkspacePhase({ hasImage: false, preview: null, generativeState: idle, selectionMask: null })).toBe("empty");
    expect(deriveWorkspacePhase({ hasImage: true, preview: null, generativeState: idle, selectionMask: createMask(2, 2) })).toBe("ready");
  });

  it("recognizes a source-resolution selection", () => {
    const selectionMask = createMask(2, 2);
    selectionMask.data[2] = 255;
    expect(deriveWorkspacePhase({ hasImage: true, preview: null, generativeState: idle, selectionMask })).toBe("selected");
  });

  it("prioritizes preview, processing, and failure over selection state", () => {
    const selectionMask = createMask(1, 1);
    selectionMask.data[0] = 255;
    const processing = { status: "processing", snapshot: {} as never, error: null, retryable: false } satisfies GenerativePreviewState;
    const failed = { status: "failed", snapshot: {} as never, error: "failed", retryable: true } satisfies GenerativePreviewState;
    const preview = { id: "preview" } as EditPreview;
    expect(deriveWorkspacePhase({ hasImage: true, preview: null, generativeState: processing, selectionMask })).toBe("processing");
    expect(deriveWorkspacePhase({ hasImage: true, preview: null, generativeState: failed, selectionMask })).toBe("failed");
    expect(deriveWorkspacePhase({ hasImage: true, preview, generativeState: failed, selectionMask })).toBe("preview");
  });
});
