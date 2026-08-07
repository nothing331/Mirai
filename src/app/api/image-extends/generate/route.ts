import sharp from "sharp";
import { configuredProviderName, createExtendProvider } from "@/server/ai/provider-factory";
import { buildExtendInstruction } from "@/server/ai/extend-instruction";
import { startRequestDiagnostics } from "@/server/diagnostics/request-diagnostic-service";
import { extendSceneAnalysisSchema, type SmartReframePlan } from "@/shared/extend-plan";
import { getExtendPreset } from "@/shared/extend-presets";
import { ImageProviderError } from "@/server/ai/contracts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const projectId = request.headers.get("x-project-id") ?? crypto.randomUUID();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const providerName = configuredProviderName();
  const diagnostics = await startRequestDiagnostics({ projectId, requestId, retryOfRequestId: null, provider: providerName });
  try {
    const form = await request.formData();
    const image = form.get("image");
    const prompt = form.get("prompt");
    if (!(image instanceof File) || typeof prompt !== "string") return error("A PNG source image and prompt are required.");
    const plan = JSON.parse(String(form.get("plan") ?? "null")) as SmartReframePlan;
    const analysis = extendSceneAnalysisSchema.parse(JSON.parse(String(form.get("analysis") ?? "null")));
    const imagePng = new Uint8Array(await image.arrayBuffer());
    const metadata = await sharp(imagePng).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== "png") return error("The source image must be a valid PNG.");
    validatePlan(plan, metadata.width, metadata.height);
    const instruction = buildExtendInstruction(plan, analysis, prompt);
    await diagnostics?.requestMetadata({ operation: "extend", boundaryPolicy: "review", userPrompt: prompt, sourceDimensions: { width: metadata.width, height: metadata.height } });
    await diagnostics?.artifact("source-input.png", imagePng, "image/png");
    await diagnostics?.artifact("extend-scene-analysis.json", jsonBytes(analysis), "application/json");
    await diagnostics?.artifact("extend-plan.json", jsonBytes(plan), "application/json");
    await diagnostics?.metadata({ providerInstruction: instruction, providerDimensions: { width: plan.outputWidth, height: plan.outputHeight }, previewSource: "protected-composite", configuration: { extendQuality: "low", extendPreset: plan.presetId, extendStrategy: plan.strategy } });
    await diagnostics?.beginProviderCall("extend-image-editor", providerName, providerName === "openai" ? (process.env.OPENAI_EXTEND_IMAGE_MODEL ?? "gpt-image-2") : "fake-extend-provider");
    const result = await createExtendProvider().extend({ sourcePng: imagePng, plan, instruction });
    await diagnostics?.completeProviderCall("extend-image-editor", result.providerRequestId);
    await diagnostics?.artifact("provider-input.png", result.providerInputPng, "image/png");
    await diagnostics?.artifact("provider-mask.png", result.providerMaskPng, "image/png");
    await diagnostics?.artifact("provider-candidate-raw.png", result.rawCandidatePng, "image/png");
    await diagnostics?.artifact("candidate-normalized.png", result.candidatePng, "image/png");
    await diagnostics?.artifact("effective-mask.png", result.effectiveMaskPng, "image/png");
    await diagnostics?.succeed(result.providerRequestId);
    return Response.json({
      candidateBase64: Buffer.from(result.candidatePng).toString("base64"),
      effectiveMaskBase64: Buffer.from(result.effectiveMaskPng).toString("base64"),
      providerRequestId: result.providerRequestId,
      resolvedInstruction: instruction,
      width: plan.outputWidth,
      height: plan.outputHeight,
      quality: "low",
    });
  } catch (cause) {
    const retryable = cause instanceof ImageProviderError && cause.retryable;
    await diagnostics?.failProviderCall("extend-image-editor", { name: cause instanceof Error ? cause.name : "Error", message: cause instanceof Error ? cause.message : "Image extension failed." }, retryable, cause instanceof ImageProviderError ? cause.diagnostics?.providerRequestId : null);
    await diagnostics?.fail({ name: cause instanceof Error ? cause.name : "Error", message: cause instanceof Error ? cause.message : "Image extension failed." }, retryable);
    return Response.json({ error: cause instanceof Error ? cause.message : "Image extension failed.", retryable }, { status: retryable ? 503 : 500 });
  }
}

function validatePlan(plan: SmartReframePlan, width: number, height: number) {
  if (!plan || plan.schemaVersion !== 1 || !getExtendPreset(plan.presetId, plan.presetVersion)) throw new Error("The Smart Reframe plan is invalid.");
  const crop = plan.sourceCrop;
  if (plan.inputWidth !== width || plan.inputHeight !== height) throw new Error("The Smart Reframe plan belongs to a different source image.");
  if (![crop.x, crop.y, crop.width, crop.height, plan.outputWidth, plan.outputHeight].every(Number.isInteger)) throw new Error("The Smart Reframe plan must use integer pixels.");
  if (crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > width || crop.y + crop.height > height) throw new Error("The Smart Reframe source crop is outside the image.");
  if (plan.sourcePlacement.x < 0 || plan.sourcePlacement.y < 0 || plan.sourcePlacement.x + crop.width > plan.outputWidth || plan.sourcePlacement.y + crop.height > plan.outputHeight) throw new Error("The Smart Reframe placement is outside the output canvas.");
  if (plan.sourcePlacement.width !== crop.width || plan.sourcePlacement.height !== crop.height) throw new Error("Extend cannot rescale the retained source image.");
  const preset = getExtendPreset(plan.presetId, plan.presetVersion)!;
  if (plan.outputWidth * preset.ratio[1] !== plan.outputHeight * preset.ratio[0]) throw new Error("The Extend output does not match the selected format.");
}

function error(message: string) { return Response.json({ error: message }, { status: 400 }); }
function jsonBytes(value: unknown) { return new TextEncoder().encode(JSON.stringify(value, null, 2)); }
