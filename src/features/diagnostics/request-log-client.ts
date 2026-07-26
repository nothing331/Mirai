import type { DiagnosticArtifactName, RequestDiagnosticManifest, RequestDiagnosticStatus, RequestDiagnosticSummary } from "@/shared/request-diagnostics";

export async function listRequestDiagnostics(projectId: string, status?: RequestDiagnosticStatus): Promise<RequestDiagnosticSummary[]> {
  const query = new URLSearchParams({ projectId, limit: "50" });
  if (status) query.set("status", status);
  const response = await fetch(`/api/request-logs?${query}`, { cache: "no-store" });
  const payload = await response.json() as { requests?: RequestDiagnosticSummary[]; error?: string };
  if (!response.ok || !payload.requests) throw new Error(payload.error ?? "Request diagnostics could not be loaded.");
  return payload.requests;
}

export async function getRequestDiagnostic(requestId: string): Promise<RequestDiagnosticManifest> {
  const response = await fetch(`/api/request-logs/${encodeURIComponent(requestId)}`, { cache: "no-store" });
  const payload = await response.json() as RequestDiagnosticManifest & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request diagnostic could not be loaded.");
  return payload;
}

export async function setRequestDiagnosticPinned(requestId: string, pinned: boolean): Promise<RequestDiagnosticManifest> {
  const response = await fetch(`/api/request-logs/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
  const payload = await response.json() as RequestDiagnosticManifest & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request diagnostic could not be updated.");
  return payload;
}

export function diagnosticArtifactUrl(requestId: string, name: DiagnosticArtifactName): string {
  return `/api/request-logs/${encodeURIComponent(requestId)}/artifacts/${encodeURIComponent(name)}`;
}
