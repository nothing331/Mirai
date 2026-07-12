import sharp from "sharp";
import { ImageProviderError } from "@/server/ai/contracts";
import type { GenerativeOperation, ProviderScenario } from "@/server/ai/contracts";
import { configuredProviderName, createImageEditProvider, parsePositiveInteger } from "@/server/ai/provider-factory";

export const runtime = "nodejs";

/** Reports safe provider capabilities needed to conditionally render development controls. */
export async function GET() {
  const provider = configuredProviderName();
  return Response.json({
    provider,
    fakeScenarios: provider === "fake" && process.env.NODE_ENV !== "production",
    quality: provider === "openai" ? (process.env.OPENAI_IMAGE_QUALITY ?? "medium") : null,
    maxInputEdge: provider === "openai" ? parsePositiveInteger(process.env.OPENAI_IMAGE_MAX_EDGE, 1536) : null,
    maxRealRequestsPerSession: parsePositiveInteger(process.env.OPENAI_MAX_REQUESTS_PER_SESSION, 3),
  });
}

/** Validates multipart browser input and delegates generation to the configured provider. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    const mask = form.get("mask");
    const operation = form.get("operation");
    const prompt = form.get("prompt");
    const scenario = form.get("scenario");
    if (!(image instanceof File) || !(mask instanceof File)) return Response.json({ error: "Image and mask files are required.", retryable: false }, { status: 400 });
    if (operation !== "remove" && operation !== "restyle") return Response.json({ error: "Choose Remove or Restyle.", retryable: false }, { status: 400 });
    if (typeof prompt !== "string") return Response.json({ error: "Prompt is required.", retryable: false }, { status: 400 });

    const imagePng = new Uint8Array(await image.arrayBuffer());
    const maskPng = new Uint8Array(await mask.arrayBuffer());
    const [imageMetadata, maskMetadata] = await Promise.all([sharp(imagePng).metadata(), sharp(maskPng).metadata()]);
    if (!imageMetadata.width || !imageMetadata.height || imageMetadata.width !== maskMetadata.width || imageMetadata.height !== maskMetadata.height) {
      return Response.json({ error: "Image and mask dimensions must match.", retryable: false }, { status: 400 });
    }
    const result = await createImageEditProvider().edit({
      imagePng, maskPng, width: imageMetadata.width, height: imageMetadata.height,
      operation: operation as GenerativeOperation, prompt,
      scenario: configuredProviderName() === "fake" && process.env.NODE_ENV !== "production" ? scenario as ProviderScenario : undefined,
    });
    return Response.json({ candidateBase64: Buffer.from(result.candidatePng).toString("base64"), providerRequestId: result.providerRequestId });
  } catch (error) {
    const retryable = error instanceof ImageProviderError && error.retryable;
    return Response.json({ error: error instanceof Error ? error.message : "Image generation failed.", retryable }, { status: retryable ? 503 : 500 });
  }
}
