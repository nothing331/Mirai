import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { assetCreationRequestSchema, type AssetCreationRequest, type AssetGenerationResponse } from "@/shared/asset-generation";
import type { DiagnosticArtifactName, RequestDiagnosticError } from "@/shared/request-diagnostics";
import { normalizeAssetCandidate } from "@/server/asset-generation/candidate-normalizer";
import { AssetGenerationProviderError } from "@/server/asset-generation/contracts";
import { buildAssetGenerationPrompt, buildImageGenerationPrompt, chooseMatteColor } from "@/server/asset-generation/prompt-builder";
import { resolveImageFormat } from "@/server/asset-generation/creation-presets";
import { assetGenerationCapabilities, createAssetGenerator } from "@/server/asset-generation/provider-factory";
import { startRequestDiagnostics } from "@/server/diagnostics/request-diagnostic-service";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(assetGenerationCapabilities());
}

/** Creates one low-quality result and returns a temporary, browser-owned PNG. */
export async function POST(request: Request) {
  const projectId = correlationId(request.headers.get("x-project-id"));
  const requestId = correlationId(request.headers.get("x-request-id"));
  const capabilities = assetGenerationCapabilities();
  const diagnostics = await startRequestDiagnostics({ projectId, requestId, retryOfRequestId: null, provider: capabilities.provider });
  let imageGenerationAttempted = false;

  try {
    const parsed = assetCreationRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new RequestValidationError(parsed.error.issues[0]?.message ?? "Check the creation request.");
    const creation = await prepareCreation(parsed.data);
    await diagnostics?.requestMetadata({
      operation: "asset-generation",
      boundaryPolicy: "review",
      userPrompt: creation.userPrompt,
      sourceDimensions: null,
    });
    await diagnostics?.metadata({
      providerInstruction: creation.prompt,
      providerDimensions: { width: creation.width, height: creation.height },
      configuration: {
        model: capabilities.model,
        quality: capabilities.quality,
        candidateCount: capabilities.candidateCount,
        outputFormat: parsed.data.format,
        creationMode: parsed.data.mode,
        treatment: parsed.data.mode === "image" ? parsed.data.treatment : null,
        colorMode: parsed.data.mode === "mark" ? parsed.data.brief.colorMode : null,
        matteColor: creation.matteColor,
        localTransparency: parsed.data.mode === "mark",
      },
    });
    await diagnostics?.event("validated", `Validated the ${parsed.data.mode} request and built its provider instruction.`, { creationMode: parsed.data.mode, outputFormat: parsed.data.format });

    imageGenerationAttempted = true;
    const result = await createAssetGenerator().generate({
      mode: parsed.data.mode,
      prompt: creation.prompt,
      count: capabilities.candidateCount,
      width: creation.width,
      height: creation.height,
      quality: capabilities.quality,
      matteColor: creation.matteColor,
      colors: creation.colors,
    }, diagnostics ?? undefined);
    const candidates = await Promise.all(result.candidates.map(async (candidate, index) => {
      await diagnostics?.artifact(candidateArtifactName(index, true), candidate.png, "image/png");
      const normalized = parsed.data.mode === "mark" && creation.matteColor
        ? await normalizeAssetCandidate(candidate.png, creation.matteColor)
        : await normalizeGeneratedImage(candidate.png);
      await diagnostics?.artifact(candidateArtifactName(index, false), normalized.png, "image/png");
      return {
        id: `${requestId}-${index + 1}`,
        candidateBase64: Buffer.from(normalized.png).toString("base64"),
        width: normalized.width,
        height: normalized.height,
        ...(normalized.transparency ? { transparency: normalized.transparency } : {}),
      };
    }));
    const warnings = candidates.flatMap((candidate, index) => !candidate.transparency || candidate.transparency.status === "clean"
      ? []
      : [`Candidate ${index + 1} may need a background cleanup pass in the editor.`]);
    await diagnostics?.event("normalization", parsed.data.mode === "mark" ? "Removed the edge-connected matte locally and prepared the transparent PNG." : "Validated the complete provider PNG without changing its composition.", {
      candidateCount: candidates.length,
      warnings: warnings.length,
    });
    await diagnostics?.succeed(result.providerRequestId);
    const response: AssetGenerationResponse = {
      projectId,
      requestId,
      provider: capabilities.provider,
      providerRequestId: result.providerRequestId,
      model: capabilities.model,
      quality: capabilities.quality,
      mode: parsed.data.mode,
      format: parsed.data.format,
      width: creation.width,
      height: creation.height,
      prompt: creation.prompt,
      candidates,
      warnings,
      imageGenerationAttempted,
    };
    return diagnosticResponse(response, 200, requestId);
  } catch (error) {
    const retryable = error instanceof AssetGenerationProviderError && error.retryable;
    const status = error instanceof RequestValidationError ? 400 : retryable ? 503 : 500;
    if (error instanceof AssetGenerationProviderError && error.diagnostics?.providerRequestId) {
      await diagnostics?.metadata({ providerRequestId: error.diagnostics.providerRequestId });
    }
    await diagnostics?.fail(toDiagnosticError(error), retryable);
    return diagnosticResponse({
      error: error instanceof Error ? error.message : "Asset generation failed.",
      retryable,
      imageGenerationAttempted,
      projectId,
      requestId,
    }, status, requestId);
  }
}

interface PreparedCreation {
  prompt: string;
  userPrompt: string;
  width: number;
  height: number;
  matteColor: string | null;
  colors: string[];
}

function prepareCreation(request: AssetCreationRequest): PreparedCreation {
  if (request.mode === "mark") {
    const colors = request.brief.colorMode === "custom" ? request.brief.colors : [];
    const matteColor = chooseMatteColor(colors);
    return { prompt: buildAssetGenerationPrompt(request.brief, matteColor), userPrompt: request.brief.description, width: 1024, height: 1024, matteColor, colors };
  }
  const format = resolveImageFormat(request.format);
  return {
    prompt: buildImageGenerationPrompt(request.prompt, request.treatment, format),
    userPrompt: request.prompt,
    width: format.width,
    height: format.height,
    matteColor: null,
    colors: [],
  };
}

async function normalizeGeneratedImage(input: Uint8Array): Promise<{ png: Uint8Array; width: number; height: number; transparency?: undefined }> {
  try {
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Missing candidate dimensions.");
    return { png: input, width: metadata.width, height: metadata.height };
  } catch {
    throw new AssetGenerationProviderError("The image provider returned an unreadable result.", true);
  }
}

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function candidateArtifactName(index: number, raw: boolean): DiagnosticArtifactName {
  if (index !== 0) throw new Error("Only one generated result is supported per request.");
  return raw ? "asset-candidate-1-raw.png" : "asset-candidate-1.png";
}

function correlationId(value: string | null): string {
  return value && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : randomUUID();
}

function diagnosticResponse(body: object, status: number, requestId: string): Response {
  return Response.json(body, { status, headers: { "x-request-id": requestId } });
}

function toDiagnosticError(error: unknown): RequestDiagnosticError {
  if (error instanceof AssetGenerationProviderError) {
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
  return { name: "UnknownError", message: "Asset generation failed." };
}
