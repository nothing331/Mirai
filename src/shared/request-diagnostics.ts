export const diagnosticArtifactNames = [
  "source-input.png",
  "selection-mask.png",
  "effective-mask.png",
  "provider-input.png",
  "provider-mask.png",
  "provider-candidate-raw.png",
  "candidate-normalized.png",
  "final-preview.png",
  "provider-response.json",
] as const;

export type DiagnosticArtifactName = typeof diagnosticArtifactNames[number];
export type RequestDiagnosticStatus = "processing" | "succeeded" | "failed";
export type RequestDiagnosticLevel = "info" | "error";

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

export interface RequestDiagnosticManifest {
  schemaVersion: 1;
  projectId: string;
  requestId: string;
  retryOfRequestId: string | null;
  providerRequestId: string | null;
  provider: "fake" | "openai";
  operation: "remove" | "replace" | "restyle" | null;
  status: RequestDiagnosticStatus;
  pinned: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  userPrompt: string;
  providerInstruction: string | null;
  sourceDimensions: { width: number; height: number } | null;
  providerDimensions: { width: number; height: number } | null;
  configuration: Record<string, string | number | boolean | null>;
  retryable: boolean | null;
  error: RequestDiagnosticError | null;
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
  metadata(values: Partial<Pick<RequestDiagnosticManifest, "providerRequestId" | "providerInstruction" | "providerDimensions" | "configuration">>): Promise<void>;
}
