import { requestDiagnosticRepository } from "@/server/diagnostics/request-diagnostic-service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  try {
    const manifest = await requestDiagnosticRepository.get(requestId);
    return manifest ? Response.json(manifest) : Response.json({ error: "Diagnostic request not found." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Diagnostic request could not be opened." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  try {
    const payload = await request.json() as { pinned?: unknown };
    if (typeof payload.pinned !== "boolean") return Response.json({ error: "Pinned must be a boolean." }, { status: 400 });
    return Response.json(await requestDiagnosticRepository.setPinned(requestId, payload.pinned));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Diagnostic request could not be updated." }, { status: 400 });
  }
}
