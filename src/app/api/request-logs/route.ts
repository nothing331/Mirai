import { requestDiagnosticRepository } from "@/server/diagnostics/request-diagnostic-service";
import type { RequestDiagnosticStatus } from "@/shared/request-diagnostics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus === "processing" || requestedStatus === "succeeded" || requestedStatus === "failed"
    ? requestedStatus satisfies RequestDiagnosticStatus
    : undefined;
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  try {
    return Response.json({ requests: await requestDiagnosticRepository.list({ projectId, status, limit }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request diagnostics could not be listed." }, { status: 400 });
  }
}
