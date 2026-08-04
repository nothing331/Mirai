import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import type { ImageEditDiagnosticSink, RequestDiagnosticError } from "@/shared/request-diagnostics";
import type { ImageEditProvider, ImageEditRequest, ProviderCandidate } from "./contracts";
import { ImageProviderError } from "./contracts";
import { buildPlannedContext } from "./intent-planner";
import { validateImageEditRequest } from "./validate-request";

/** Adapts OpenAI image edits to the application-owned provider contract. */
export class OpenAIImageEditProvider implements ImageEditProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = "gpt-image-2",
    private readonly quality: "low" | "medium" | "high" | "auto" = "medium",
    private readonly maxInputEdge = 1536,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async edit(request: ImageEditRequest, diagnostics?: ImageEditDiagnosticSink): Promise<ProviderCandidate> {
    validateImageEditRequest(request);
    try {
      const scale = Math.min(1, this.maxInputEdge / Math.max(request.width, request.height));
      const providerWidth = Math.max(1, Math.round(request.width * scale));
      const providerHeight = Math.max(1, Math.round(request.height * scale));
      const providerImage = await sharp(request.imagePng).resize(providerWidth, providerHeight, { fit: "fill" }).png().toBuffer();
      const providerMask = await makeOpenAITransparencyMask(request.maskPng, providerWidth, providerHeight);
      const selection = await describeSelection(request.maskPng, request.width, request.height);
      const instruction = buildEditInstruction(request.operation, request.prompt, selection, request.boundaryPolicy, request.plan);
      await diagnostics?.event("provider-preparation", "Prepared resized provider image, transparency mask, and instruction.", { providerWidth, providerHeight });
      await diagnostics?.artifact("provider-input.png", providerImage, "image/png");
      await diagnostics?.artifact("provider-mask.png", providerMask, "image/png");
      await diagnostics?.metadata({
        providerInstruction: instruction,
        providerDimensions: { width: providerWidth, height: providerHeight },
        configuration: { model: this.model, quality: this.quality, maxInputEdge: this.maxInputEdge, outputFormat: "png" },
      });
      await diagnostics?.beginProviderCall("image-editor", "openai", this.model);
      await diagnostics?.event("provider-call", "Calling the OpenAI image-edit provider.");
      const { data: response, request_id: providerRequestId } = await this.client.images.edit({
        model: this.model,
        image: await toFile(providerImage, "image.png", { type: "image/png" }),
        mask: await toFile(providerMask, "mask.png", { type: "image/png" }),
        prompt: instruction,
        size: "auto",
        quality: this.quality,
        ...(supportsInputFidelity(this.model) ? { input_fidelity: "high" as const } : {}),
        output_format: "png",
      }).withResponse();
      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) throw new ImageProviderError("OpenAI returned no image candidate.", true, { providerRequestId });
      const rawCandidate = Buffer.from(encoded, "base64");
      await diagnostics?.event("provider-response", "OpenAI returned an image candidate.", { candidateCount: response.data?.length ?? 0 });
      await diagnostics?.artifact("provider-candidate-raw.png", rawCandidate, "image/png");
      await diagnostics?.artifact("provider-response.json", new TextEncoder().encode(JSON.stringify({
        providerRequestId,
        created: response.created,
        usage: response.usage,
        background: response.background,
        outputFormat: response.output_format,
        quality: response.quality,
        size: response.size,
        candidates: response.data?.map((candidate) => ({ revisedPrompt: candidate.revised_prompt ?? null })) ?? [],
      }, null, 2)), "application/json");
      await diagnostics?.completeProviderCall("image-editor", providerRequestId, flattenUsage(response.usage));
      const normalized = await sharp(rawCandidate).resize(request.width, request.height, { fit: "fill" }).png().toBuffer();
      await diagnostics?.event("normalization", "Normalized the provider candidate to source-image dimensions.", { width: request.width, height: request.height });
      await diagnostics?.artifact("candidate-normalized.png", normalized, "image/png");
      await diagnostics?.metadata({ providerRequestId });
      return { candidatePng: normalized, providerRequestId: providerRequestId ?? `openai-unreported-${crypto.randomUUID()}` };
    } catch (error) {
      const providerError = error instanceof ImageProviderError ? error : new ImageProviderError(
        error instanceof Error ? error.message : "OpenAI image editing failed.",
        isRetryableStatus(error instanceof OpenAI.APIError ? error.status : undefined),
        error instanceof OpenAI.APIError ? {
          providerRequestId: error.requestID,
          status: error.status,
          code: error.code ?? undefined,
          type: error.type,
        } : undefined,
      );
      await diagnostics?.failProviderCall("image-editor", toDiagnosticError(providerError), providerError.retryable, providerError.diagnostics?.providerRequestId);
      throw providerError;
    }
  }
}

/** Prevents optional image-edit parameters from being sent to model versions that reject them. */
export function supportsInputFidelity(model: string): boolean {
  if (model === "gpt-image-1" || model.startsWith("gpt-image-1-")) return !model.startsWith("gpt-image-1-mini");
  return model === "gpt-image-1.5" || model.startsWith("gpt-image-1.5-");
}

interface SelectionDescription {
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
  touchesImageEdge: boolean;
}

/** Builds operation-specific constraints so a selection is treated as context, placement, or material—not a crop. */
export function buildEditInstruction(
  operation: ImageEditRequest["operation"],
  prompt: string,
  selection: SelectionDescription,
  boundaryPolicy: ImageEditRequest["boundaryPolicy"],
  plan?: ImageEditRequest["plan"],
): string {
  if (operation === "transform") return prompt;
  const geometry = `The user's marked focus begins at ${selection.leftPercent}% from the left and ${selection.topPercent}% from the top, and spans ${selection.widthPercent}% of the image width by ${selection.heightPercent}% of the image height.`;
  const scope = boundaryPolicy === "protected"
    ? "Treat that focus as a strict edit boundary. Keep every visible change inside it and preserve every pixel outside it exactly."
    : "Treat that focus as an approximate indication of intent, not as a clipping boundary. Extend complete subjects, readable text, shadows, reflections, and natural blending beyond it when needed, while preserving unrelated scene content as faithfully as possible.";
  if (operation === "remove") {
    return `Remove the selected subject completely. Reconstruct the background continuously using the surrounding scene as evidence. Continue visible lines, surfaces, shadows, texture, depth, perspective, lighting, and natural irregularities through the removed area. Do not leave a blur, smudge, repeated texture, halo, outline, patch, or ghost of the removed subject. Do not add any new object, person, text, decoration, or focal element. ${geometry} ${scope} ${prompt}`.trim();
  }
  if (operation === "replace") {
    const plannedContext = plan ? buildPlannedContext(plan) : "Infer the most physically plausible representation from the selected surface and surrounding scene.";
    const edgeConstraint = selection.touchesImageEdge ? "The focus touches an image edge; avoid accidental cropping unless the instruction asks for it." : "Keep the requested content complete and visually balanced in the surrounding composition.";
    return `Add or replace content according to this instruction: ${prompt}. ${plannedContext} ${edgeConstraint} Integrate it convincingly with correct perspective, scale, contact, occlusion, lighting, reflections, and shadows appropriate to its planned representation. ${geometry} ${scope} Introduce no unrelated objects or text.`;
  }
  return `Restyle the existing selected content according to this instruction: ${prompt}. Keep the selected subject's identity, silhouette, geometry, scale, and position. Change only the requested appearance or material; do not add a new subject or crop existing parts. Match the scene's lighting and perspective. ${geometry} ${scope}`;
}

function flattenUsage(usage: unknown): Record<string, string | number | boolean | null> {
  if (!usage || typeof usage !== "object") return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
}

function toDiagnosticError(error: ImageProviderError): RequestDiagnosticError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    providerStatus: error.diagnostics?.status,
    providerCode: error.diagnostics?.code,
    providerType: error.diagnostics?.type,
  };
}

async function describeSelection(maskPng: Uint8Array, width: number, height: number): Promise<SelectionDescription> {
  const pixels = await sharp(maskPng).ensureAlpha().resize(width, height, { fit: "fill" }).raw().toBuffer();
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let index = 0; index < width * height; index += 1) {
    if (pixels[index * 4 + 3] <= 16) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    leftPercent: round(minX / width * 100), topPercent: round(minY / height * 100),
    widthPercent: round((maxX - minX + 1) / width * 100), heightPercent: round((maxY - minY + 1) / height * 100),
    touchesImageEdge: minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2,
  };
}

/** Converts the application's positive-alpha selection into OpenAI's transparent edit area. */
async function makeOpenAITransparencyMask(maskPng: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const pixels = await sharp(maskPng).ensureAlpha().resize(width, height, { fit: "fill" }).raw().toBuffer();
  for (let index = 0; index < width * height; index += 1) {
    const pixel = index * 4;
    pixels[pixel] = 255;
    pixels[pixel + 1] = 255;
    pixels[pixel + 2] = 255;
    pixels[pixel + 3] = 255 - pixels[pixel + 3];
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
