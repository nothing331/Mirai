import type { EditPlan } from "./edit-plan";
import type { CandidateAnalysis, EditBoundaryPolicy } from "./edit-boundary";

export const diagnosticArtifactNames = [
  "source-input.png",
  "selection-mask.png",
  "effective-mask.png",
  "planner-context.png",
  "planner-selection-detail.png",
  "edit-plan.json",
  "planner-response.json",
  "provider-input.png",
  "provider-mask.png",
  "provider-candidate-raw.png",
  "candidate-normalized.png",
  "change-map.png",
  "candidate-analysis.json",
  "final-preview.png",
  "provider-response.json",
] as const;

export type DiagnosticArtifactName = typeof diagnosticArtifactNames[number];
export type RequestDiagnosticStatus = "processing" | "succeeded" | "failed";
export type RequestDiagnosticLevel = "info" | "error";
export type ProviderCallStage = "intent-planner" | "image-editor";
export type ProviderCallStatus = "processing" | "succeeded" | "failed";

export interface RequestDiagnosticEvent {
  id: string;
  timestamp: string;
  stage: string;
  level: RequestDiagnosticLevel;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface RequestDiagnosticArtifact {
  name: DiagnosticArtifactName;
  mediaType: "image/png" | "application/json";
  bytes: number;
  sha256: string;
}

export interface RequestDiagnosticError {
  name: string;
  message: string;
  stack?: string;
  providerStatus?: number;
  providerCode?: string;
  providerType?: string;
}

export interface RequestDiagnosticProviderCall {
  stage: ProviderCallStage;
  provider: "fake" | "openai";
  model: string;
  providerRequestId: string | null;
  status: ProviderCallStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  usage: Record<string, string | number | boolean | null>;
  retryable: boolean | null;
  error: RequestDiagnosticError | null;
}

export interface RequestDiagnosticManifest {
  schemaVersion: 3;
  projectId: string;
  requestId: string;
  retryOfRequestId: string | null;
  providerRequestId: string | null;
  provider: "fake" | "openai";
  operation: "remove" | "replace" | "restyle" | null;
  boundaryPolicy: EditBoundaryPolicy;
  previewSource: "full-candidate" | "protected-composite" | null;
  status: RequestDiagnosticStatus;
  pinned: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  userPrompt: string;
  plannerInstruction: string | null;
  editPlan: EditPlan | null;
  candidateAnalysis: CandidateAnalysis | null;
  providerInstruction: string | null;
  sourceDimensions: { width: number; height: number } | null;
  providerDimensions: { width: number; height: number } | null;
  configuration: Record<string, string | number | boolean | null>;
  retryable: boolean | null;
  error: RequestDiagnosticError | null;
  providerCalls: RequestDiagnosticProviderCall[];
  events: RequestDiagnosticEvent[];
  artifacts: Partial<Record<DiagnosticArtifactName, RequestDiagnosticArtifact>>;
  bundlePath: string;
}

export type RequestDiagnosticSummary = Pick<
  RequestDiagnosticManifest,
  "projectId" | "requestId" | "retryOfRequestId" | "providerRequestId" | "provider" | "operation" | "status" | "pinned" | "startedAt" | "updatedAt" | "completedAt" | "durationMs" | "retryable" | "error" | "bundlePath"
> & { artifactNames: DiagnosticArtifactName[] };

export interface ImageEditDiagnosticSink {
  event(stage: string, message: string, details?: Record<string, string | number | boolean | null>): Promise<void>;
  artifact(name: DiagnosticArtifactName, bytes: Uint8Array, mediaType: RequestDiagnosticArtifact["mediaType"]): Promise<void>;
  metadata(values: Partial<Pick<RequestDiagnosticManifest, "providerRequestId" | "plannerInstruction" | "editPlan" | "candidateAnalysis" | "providerInstruction" | "providerDimensions" | "previewSource" | "configuration">>): Promise<void>;
  beginProviderCall(stage: ProviderCallStage, provider: RequestDiagnosticProviderCall["provider"], model: string): Promise<void>;
  completeProviderCall(stage: ProviderCallStage, providerRequestId: string | null, usage?: RequestDiagnosticProviderCall["usage"]): Promise<void>;
  failProviderCall(stage: ProviderCallStage, error: RequestDiagnosticError, retryable: boolean, providerRequestId?: string | null): Promise<void>;
}
