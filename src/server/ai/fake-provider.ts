import sharp from "sharp";
import type { ImageEditDiagnosticSink, RequestDiagnosticError } from "@/shared/request-diagnostics";
import type { ImageEditProvider, ImageEditRequest, ProviderCandidate } from "./contracts";
import { ImageProviderError } from "./contracts";
import { validateImageEditRequest } from "./validate-request";

/** Produces deterministic, visibly synthetic candidates for pipeline and failure testing. */
export class FakeImageEditProvider implements ImageEditProvider {
  async edit(request: ImageEditRequest, diagnostics?: ImageEditDiagnosticSink): Promise<ProviderCandidate> {
    validateImageEditRequest(request);
    await diagnostics?.beginProviderCall("image-editor", "fake", "fake-image-editor");
    await diagnostics?.event("provider-preparation", "Prepared deterministic fake-provider inputs.");
    await diagnostics?.artifact("provider-input.png", request.imagePng, "image/png");
    if (request.maskPng) await diagnostics?.artifact("provider-mask.png", request.maskPng, "image/png");
    await diagnostics?.metadata({
      providerInstruction: request.prompt,
      providerDimensions: { width: request.width, height: request.height },
      configuration: { scenario: request.scenario ?? "success", boundaryPolicy: request.boundaryPolicy },
    });
    if (request.scenario === "slow") await new Promise((resolve) => setTimeout(resolve, 700));
    if (request.scenario === "retryable-error") {
      const error = new ImageProviderError("The fake provider is temporarily unavailable.", true);
      await diagnostics?.failProviderCall("image-editor", toDiagnosticError(error), true);
      throw error;
    }
    if (request.scenario === "fatal-error") {
      const error = new ImageProviderError("The fake provider rejected this edit.", false);
      await diagnostics?.failProviderCall("image-editor", toDiagnosticError(error), false);
      throw error;
    }

    const image = await sharp(request.imagePng).ensureAlpha().resize(request.width, request.height, { fit: "fill" }).raw().toBuffer();
    const mask = request.maskPng
      ? await sharp(request.maskPng).ensureAlpha().resize(request.width, request.height, { fit: "fill" }).raw().toBuffer()
      : Buffer.alloc(request.width * request.height * 4, 255);
    const candidate = Buffer.from(image);
    for (let index = 0; index < request.width * request.height; index += 1) {
      const pixel = index * 4;
      const x = index % request.width;
      const y = Math.floor(index / request.width);
      const selected = mask[pixel + 3] > 0;
      if (!selected) {
        candidate[pixel] = 255 - image[pixel];
        candidate[pixel + 1] = 255 - image[pixel + 1];
        candidate[pixel + 2] = 255 - image[pixel + 2];
      } else if (request.operation === "remove") {
        const neutral = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 198 : 222;
        candidate[pixel] = neutral;
        candidate[pixel + 1] = neutral;
        candidate[pixel + 2] = neutral;
      } else {
        candidate[pixel] = (image[pixel + 1] + x * 7) % 256;
        candidate[pixel + 1] = (image[pixel + 2] + y * 9) % 256;
        candidate[pixel + 2] = (image[pixel] + (x + y) * 5) % 256;
      }
    }
    const candidatePng = await sharp(candidate, { raw: { width: request.width, height: request.height, channels: 4 } }).png().toBuffer();
    const providerRequestId = `fake-${crypto.randomUUID()}`;
    await diagnostics?.event("provider-response", "Fake provider produced a deterministic candidate.");
    await diagnostics?.artifact("provider-candidate-raw.png", candidatePng, "image/png");
    await diagnostics?.artifact("candidate-normalized.png", candidatePng, "image/png");
    await diagnostics?.artifact("provider-response.json", new TextEncoder().encode(JSON.stringify({
      providerRequestId,
      scenario: request.scenario ?? "success",
      candidateCount: 1,
    }, null, 2)), "application/json");
    await diagnostics?.metadata({ providerRequestId });
    await diagnostics?.completeProviderCall("image-editor", providerRequestId);
    return { candidatePng, providerRequestId };
  }
}

function toDiagnosticError(error: ImageProviderError): RequestDiagnosticError {
  return { name: error.name, message: error.message, stack: error.stack };
}
