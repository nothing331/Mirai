import { maskHasSelection } from "../mask";
import type { EditPreview, GenerativePreviewState, ProcessingMask } from "../types";

export type WorkspacePhase = "empty" | "ready" | "selected" | "processing" | "preview" | "failed";

/** Derives presentation state from editor truth so the shell cannot drift from the edit pipeline. */
export function deriveWorkspacePhase(input: {
  hasImage: boolean;
  preview: EditPreview | null;
  generativeState: GenerativePreviewState;
  selectionMask: ProcessingMask | null;
}): WorkspacePhase {
  if (!input.hasImage) return "empty";
  if (input.preview) return "preview";
  if (input.generativeState.status === "processing") return "processing";
  if (input.generativeState.status === "failed") return "failed";
  if (input.selectionMask && maskHasSelection(input.selectionMask)) return "selected";
  return "ready";
}
