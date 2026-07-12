import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import type { ImageEditProvider, ImageEditRequest, ProviderCandidate } from "./contracts";
import { ImageProviderError } from "./contracts";
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

  async edit(request: ImageEditRequest): Promise<ProviderCandidate> {
    validateImageEditRequest(request);
    try {
      const scale = Math.min(1, this.maxInputEdge / Math.max(request.width, request.height));
      const providerWidth = Math.max(1, Math.round(request.width * scale));
      const providerHeight = Math.max(1, Math.round(request.height * scale));
      const providerImage = await sharp(request.imagePng).resize(providerWidth, providerHeight, { fit: "fill" }).png().toBuffer();
      const providerMask = await makeOpenAITransparencyMask(request.maskPng, providerWidth, providerHeight);
      const instruction = request.operation === "remove"
        ? `Remove the selected content completely and naturally reconstruct only the background that should exist behind it. Do not introduce any new object, person, character, text, decoration, or illustration. Match the surrounding lighting, perspective, material, texture, and geometry. Preserve all unselected content. ${request.prompt}`.trim()
        : `Restyle only the selected area as follows: ${request.prompt}. Preserve lighting, perspective, boundaries, and all unselected content.`;
      const response = await this.client.images.edit({
        model: this.model,
        image: await toFile(providerImage, "image.png", { type: "image/png" }),
        mask: await toFile(providerMask, "mask.png", { type: "image/png" }),
        prompt: instruction,
        size: "auto",
        quality: this.quality,
        output_format: "png",
      });
      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) throw new ImageProviderError("OpenAI returned no image candidate.", true);
      const normalized = await sharp(Buffer.from(encoded, "base64")).resize(request.width, request.height, { fit: "fill" }).png().toBuffer();
      return { candidatePng: normalized, providerRequestId: `openai-${crypto.randomUUID()}` };
    } catch (error) {
      if (error instanceof ImageProviderError) throw error;
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      throw new ImageProviderError(error instanceof Error ? error.message : "OpenAI image editing failed.", status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500));
    }
  }
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
