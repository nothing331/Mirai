export type EditBoundaryPolicy = "review" | "protected";

export type CandidateAnalysisClassification =
  | "analysis-unavailable"
  | "no-material-change"
  | "candidate-within-selection"
  | "candidate-extends-selection";

export type CandidateAnalysisWarning =
  | "candidate-analysis-failed"
  | "changes-outside-selection"
  | "changes-touch-selection-boundary";

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
