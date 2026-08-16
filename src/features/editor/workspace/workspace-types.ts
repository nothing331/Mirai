import type { Tool } from "../types";

export type BusyAction = "upload" | "open" | "save" | null;
export type ExportFormat = "image/png" | "image/jpeg";
export type ComparisonBase = "original" | "previous";

export type WorkspaceWorkflow =
  | { kind: "canvas"; tool: Tool }
  | { kind: "size-position" }
  | { kind: "text" }
  | { kind: "watermark" }
  | { kind: "transform" }
  | { kind: "extend" };

export interface ProviderCapabilities {
  provider: "fake" | "openai";
  fakeScenarios: boolean;
  plannerModel: string;
  imageModel: string;
  quality: string | null;
  maxInputEdge: number | null;
  maxRealRequestsPerSession: number;
}
