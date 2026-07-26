import { requestDiagnosticRepository } from "@/server/diagnostics/request-diagnostic-service";
import { diagnosticArtifactNames, type DiagnosticArtifactName } from "@/shared/request-diagnostics";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ requestId: string; name: string }> }) {
  const { requestId, name } = await context.params;
  if (!diagnosticArtifactNames.includes(name as DiagnosticArtifactName)) {
    return Response.json({ error: "Diagnostic artifact not found." }, { status: 404 });
  }
  try {
    const artifact = await requestDiagnosticRepository.readArtifact(requestId, name as DiagnosticArtifactName);
    if (!artifact) return Response.json({ error: "Diagnostic artifact not found." }, { status: 404 });
    return new Response(Buffer.from(artifact.bytes), {
      headers: {
        "content-type": artifact.mediaType,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Diagnostic artifact could not be opened." }, { status: 400 });
  }
}
