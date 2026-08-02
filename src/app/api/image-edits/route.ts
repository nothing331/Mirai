import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ImageProviderError } from "@/server/ai/contracts";
import type { GenerativeOperation, ProviderScenario } from "@/server/ai/contracts";
import { configuredPlannerModel, configuredProviderName, createEditIntentPlanner, createImageEditProvider, parsePositiveInteger } from "@/server/ai/provider-factory";
import { startRequestDiagnostics } from "@/server/diagnostics/request-diagnostic-service";
import type { RequestDiagnosticError } from "@/shared/request-diagnostics";

export const runtime = "nodejs";

/** Reports safe provider capabilities needed to conditionally render development controls. */
export async function GET() {
  const provider = configuredProviderName();
  return Response.json({
    provider,
    plannerModel: provider === "openai" ? configuredPlannerModel() : "fake-intent-planner",
    imageModel: provider === "openai" ? (process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2") : "fake-image-editor",
    fakeScenarios: provider === "fake",
    quality: provider === "openai" ? (process.env.OPENAI_IMAGE_QUALITY ?? "medium") : null,
    maxInputEdge: provider === "openai" ? parsePositiveInteger(process.env.OPENAI_IMAGE_MAX_EDGE, 1536) : null,
    maxRealRequestsPerSession: parsePositiveInteger(process.env.OPENAI_MAX_REQUESTS_PER_SESSION, 3),
  });
}

/** Validates multipart browser input, records reproducible diagnostics, and delegates generation. */
export async function POST(request: Request) {
  const projectId = correlationId(request.headers.get("x-project-id"));
  const requestId = correlationId(request.headers.get("x-request-id"));
  const retryOfRequestId = optionalCorrelationId(request.headers.get("x-retry-of-request-id"));
  const providerName = configuredProviderName();
  const diagnostics = await startRequestDiagnostics({ projectId, requestId, retryOfRequestId, provider: providerName });
  let imageGenerationAttempted = false;

  try {
    const form = await request.formData();
    const image = form.get("image");
    const selectionMask = form.get("selectionMask");
    const effectiveMask = form.get("mask");
    const operation = form.get("operation");
    const prompt = form.get("prompt");
    const scenario = form.get("scenario");
    if (!(image instanceof File) || !(selectionMask instanceof File) || !(effectiveMask instanceof File)) {
      throw new RequestValidationError("Image, selection mask, and effective mask files are required.");
    }
    if (operation !== "remove" && operation !== "replace" && operation !== "restyle") {
      throw new RequestValidationError("Choose Remove, Add / replace, or Restyle.");
    }
    if (typeof prompt !== "string") throw new RequestValidationError("Prompt is required.");

    await diagnostics?.event("parsed", "Parsed multipart image-edit request.", {
      sourceBytes: image.size,
      selectionMaskBytes: selectionMask.size,
      effectiveMaskBytes: effectiveMask.size,
    });
    const imagePng = new Uint8Array(await image.arrayBuffer());
    const selectionMaskPng = new Uint8Array(await selectionMask.arrayBuffer());
    const maskPng = new Uint8Array(await effectiveMask.arrayBuffer());
    const [imageMetadata, selectionMetadata, maskMetadata] = await Promise.all([
      sharp(imagePng).metadata(),
      sharp(selectionMaskPng).metadata(),
      sharp(maskPng).metadata(),
    ]);
    if (
      !imageMetadata.width || !imageMetadata.height
      || imageMetadata.format !== "png" || selectionMetadata.format !== "png" || maskMetadata.format !== "png"
      || imageMetadata.width !== selectionMetadata.width || imageMetadata.height !== selectionMetadata.height
      || imageMetadata.width !== maskMetadata.width || imageMetadata.height !== maskMetadata.height
    ) {
      throw new RequestValidationError("Image, selection mask, and effective mask must be same-size PNG files.");
    }

    await diagnostics?.requestMetadata({
      operation,
      userPrompt: prompt,
      sourceDimensions: { width: imageMetadata.width, height: imageMetadata.height },
    });
    await diagnostics?.artifact("source-input.png", imagePng, "image/png");
    await diagnostics?.artifact("selection-mask.png", selectionMaskPng, "image/png");
    await diagnostics?.artifact("effective-mask.png", maskPng, "image/png");
    await diagnostics?.event("validated", "Validated source-image dimensions and request parameters.", {
      width: imageMetadata.width,
      height: imageMetadata.height,
      operation,
    });

    const plan = operation === "replace" ? (await createEditIntentPlanner().plan({
      imagePng,
      selectionMaskPng,
      width: imageMetadata.width,
      height: imageMetadata.height,
      prompt,
    }, diagnostics ?? undefined)).plan : undefined;
    if (plan) {
      await diagnostics?.event("final-instruction", "Constructing the image-editor instruction from the validated edit plan.", {
        representation: plan.representation,
        confidence: plan.confidence,
      });
    }

    imageGenerationAttempted = true;
    const result = await createImageEditProvider().edit({
      imagePng,
      maskPng,
      width: imageMetadata.width,
      height: imageMetadata.height,
      operation: operation as GenerativeOperation,
      prompt,
      plan,
      scenario: providerName === "fake" ? scenario as ProviderScenario : undefined,
    }, diagnostics ?? undefined);
    await diagnostics?.succeed(result.providerRequestId);
    return diagnosticResponse({
      candidateBase64: Buffer.from(result.candidatePng).toString("base64"),
      providerRequestId: result.providerRequestId,
      imageGenerationAttempted,
      projectId,
      requestId,
    }, 200, requestId);
  } catch (error) {
    const retryable = error instanceof ImageProviderError && error.retryable;
    const status = error instanceof RequestValidationError ? 400 : retryable ? 503 : 500;
    if (imageGenerationAttempted && error instanceof ImageProviderError && error.diagnostics?.providerRequestId) {
      await diagnostics?.metadata({ providerRequestId: error.diagnostics.providerRequestId });
    }
    await diagnostics?.fail(toDiagnosticError(error), retryable);
    return diagnosticResponse({
      error: error instanceof Error ? error.message : "Image generation failed.",
      retryable,
      imageGenerationAttempted,
      projectId,
      requestId,
    }, status, requestId);
  }
}

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function correlationId(value: string | null): string {
  return value && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : randomUUID();
}

function optionalCorrelationId(value: string | null): string | null {
  return value && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : null;
}

function diagnosticResponse(body: object, status: number, requestId: string): Response {
  return Response.json(body, { status, headers: { "x-request-id": requestId } });
}

function toDiagnosticError(error: unknown): RequestDiagnosticError {
  if (error instanceof ImageProviderError) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      providerStatus: error.diagnostics?.status,
      providerCode: error.diagnostics?.code,
      providerType: error.diagnostics?.type,
    };
  }
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "UnknownError", message: "Image generation failed." };
}
