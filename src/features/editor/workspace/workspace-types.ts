export type BusyAction = "upload" | "open" | "save" | null;
export type ExportFormat = "image/png" | "image/jpeg";
export type ComparisonBase = "original" | "previous";

export interface ProviderCapabilities {
  provider: "fake" | "openai";
  fakeScenarios: boolean;
  plannerModel: string;
  imageModel: string;
  quality: string | null;
  maxInputEdge: number | null;
  maxRealRequestsPerSession: number;
}
