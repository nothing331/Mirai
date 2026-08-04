export type EditBoundaryPolicy = "review" | "protected";

export type CandidateAnalysisClassification =
  | "analysis-unavailable"
  | "no-material-change"
  | "candidate-within-selection"
  | "candidate-extends-selection"
  | "replace-scope-mismatch";

export type CandidateAnalysisWarning =
  | "candidate-analysis-failed"
  | "changes-outside-selection"
  | "changes-touch-selection-boundary"
  | "replace-scope-mismatch";

export interface CandidateAnalysis {
  differenceThreshold: number;
  changedPixels: number;
  changedPixelRatio: number;
  changedInsideSelectionPixels: number;
  changedInsideSelectionRatio: number;
  changedOutsideSelectionPixels: number;
  changedOutsideSelectionRatio: number;
  changedBoundaryPixels: number;
  classification: CandidateAnalysisClassification;
  warnings: CandidateAnalysisWarning[];
}

/** Blocks unsafe review-mode Replace proposals; protected composites remain bounded by construction. */
export function blocksReplaceReviewAcceptance(
  operation: "remove" | "replace" | "restyle",
  boundaryPolicy: EditBoundaryPolicy,
  analysis: CandidateAnalysis,
): boolean {
  return operation === "replace"
    && boundaryPolicy === "review"
    && analysis.classification === "replace-scope-mismatch";
}
