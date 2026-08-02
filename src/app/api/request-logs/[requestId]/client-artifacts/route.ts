import sharp from "sharp";
import { requestDiagnosticRepository } from "@/server/diagnostics/request-diagnostic-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  try {
    const manifest = await requestDiagnosticRepository.get(requestId);
    if (!manifest) return Response.json({ error: "Diagnostic request not found." }, { status: 404 });
    const projectId = request.headers.get("x-project-id");
    if (projectId !== manifest.projectId) return Response.json({ error: "Project ID does not match this diagnostic request." }, { status: 409 });
    const form = await request.formData();
    const preview = form.get("finalPreview");
    const boundaryPolicy = form.get("boundaryPolicy");
    if (!(preview instanceof File) || preview.size === 0) return Response.json({ error: "Final preview PNG is required." }, { status: 400 });
    if (boundaryPolicy !== manifest.boundaryPolicy) return Response.json({ error: "Preview boundary policy does not match this request." }, { status: 409 });
    const bytes = new Uint8Array(await preview.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== "png" || metadata.width !== manifest.sourceDimensions?.width || metadata.height !== manifest.sourceDimensions.height) {
      return Response.json({ error: "Final preview must be a source-dimension PNG." }, { status: 400 });
    }
    await requestDiagnosticRepository.writeArtifact(requestId, "final-preview.png", bytes, "image/png");
    await requestDiagnosticRepository.mutate(requestId, (current) => {
      current.previewSource = boundaryPolicy === "protected" ? "protected-composite" : "full-candidate";
      current.events.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        stage: "client-preview",
        level: "info",
        message: boundaryPolicy === "protected"
          ? "Browser composited the normalized candidate through the protected mask."
          : "Browser preserved the complete normalized provider candidate.",
        details: { width: metadata.width!, height: metadata.height!, bytes: preview.size },
      });
    });
    return Response.json({ projectId: manifest.projectId, requestId });
  } catch (error) {
    console.error(`[diagnostics:${requestId}] Could not store final preview.`, error);
    return Response.json({ error: error instanceof Error ? error.message : "Final preview could not be stored." }, { status: 400 });
  }
}
