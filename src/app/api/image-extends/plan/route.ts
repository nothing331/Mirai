import sharp from "sharp";
import { configuredProviderName, createExtendPlanner } from "@/server/ai/provider-factory";
import { startRequestDiagnostics } from "@/server/diagnostics/request-diagnostic-service";
import { extendSceneAnalysisSchema, solveSmartReframe, type ExtendStrategy } from "@/shared/extend-plan";
import { getExtendPreset, isExtendPresetId } from "@/shared/extend-presets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const projectId = request.headers.get("x-project-id") ?? crypto.randomUUID();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const diagnostics = await startRequestDiagnostics({ projectId, requestId, retryOfRequestId: null, provider: configuredProviderName() });
  try {
    const form = await request.formData();
    const image = form.get("image");
    const presetId = form.get("presetId");
    const presetVersion = Number.parseInt(String(form.get("presetVersion") ?? ""), 10);
    const strategy = form.get("strategy");
    if (!(image instanceof File)) return error("A PNG source image is required.");
    if (typeof presetId !== "string" || !isExtendPresetId(presetId)) return error("Choose a valid Extend format.");
    if (strategy !== "smart" && strategy !== "preserve-all") return error("Choose Smart Reframe or Keep full image.");
    const preset = getExtendPreset(presetId, presetVersion);
    if (!preset) return error("The selected Extend preset version is unavailable.");
    const imagePng = new Uint8Array(await image.arrayBuffer());
    const metadata = await sharp(imagePng).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== "png") return error("The source image must be a valid PNG.");
    const cached = form.get("analysis");
    await diagnostics?.requestMetadata({ operation: "extend", boundaryPolicy: "review", userPrompt: "", sourceDimensions: { width: metadata.width, height: metadata.height } });
    await diagnostics?.artifact("source-input.png", imagePng, "image/png");
    const plannerResult = typeof cached === "string" && cached.length > 0 ? null : await createExtendPlanner().analyze({ imagePng, width: metadata.width, height: metadata.height }, diagnostics ?? undefined);
    const analysis = typeof cached === "string" && cached.length > 0
      ? extendSceneAnalysisSchema.parse(JSON.parse(cached))
      : plannerResult!.analysis;
    const plan = solveSmartReframe({ width: metadata.width, height: metadata.height, presetId, presetVersion: 1, ratio: preset.ratio, strategy: strategy as ExtendStrategy, analysis });
    await diagnostics?.artifact("extend-scene-analysis.json", jsonBytes(analysis), "application/json");
    await diagnostics?.artifact("extend-plan.json", jsonBytes(plan), "application/json");
    await diagnostics?.metadata({ configuration: { extendPreset: presetId, extendStrategy: strategy, cachedSceneAnalysis: Boolean(cached) } });
    await diagnostics?.succeed(plannerResult?.providerRequestId ?? null);
    return Response.json({ analysis, plan });
  } catch (cause) {
    await diagnostics?.fail({ name: cause instanceof Error ? cause.name : "Error", message: cause instanceof Error ? cause.message : "Smart Reframe planning failed." }, false);
    return Response.json({ error: cause instanceof Error ? cause.message : "Smart Reframe planning failed." }, { status: 500 });
  }
}

function error(message: string) { return Response.json({ error: message }, { status: 400 }); }
function jsonBytes(value: unknown) { return new TextEncoder().encode(JSON.stringify(value, null, 2)); }
