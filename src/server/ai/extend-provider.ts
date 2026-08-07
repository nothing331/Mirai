import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import type { SmartReframePlan } from "@/shared/extend-plan";
import { ImageProviderError } from "./contracts";

export interface ExtendProviderRequest { sourcePng: Uint8Array; plan: SmartReframePlan; instruction: string }
export interface ExtendProviderResult { candidatePng: Uint8Array; rawCandidatePng: Uint8Array; effectiveMaskPng: Uint8Array; providerInputPng: Uint8Array; providerMaskPng: Uint8Array; providerRequestId: string }

export interface ExtendProvider { extend(request: ExtendProviderRequest): Promise<ExtendProviderResult> }

export class OpenAIExtendProvider implements ExtendProvider {
  private readonly client: OpenAI;
  constructor(apiKey: string, private readonly model = "gpt-image-2", private readonly maxEdge = 1536) { this.client = new OpenAI({ apiKey }); }

  async extend(request: ExtendProviderRequest): Promise<ExtendProviderResult> {
    const prepared = await prepareProviderInput(request.sourcePng, request.plan, this.maxEdge);
    let providerRequestId: string | null = null;
    try {
      const { data: response, request_id: requestId } = await this.client.images.edit({
        model: this.model,
        image: await toFile(Buffer.from(prepared.inputPng), "extend-input.png", { type: "image/png" }),
        mask: await toFile(Buffer.from(prepared.maskPng), "extend-mask.png", { type: "image/png" }),
        prompt: request.instruction,
        size: `${prepared.providerWidth}x${prepared.providerHeight}`,
        quality: "low",
        output_format: "png",
      }).withResponse();
      providerRequestId = requestId;
      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) throw new ImageProviderError("The image provider returned no Extend candidate.", false, { providerRequestId });
      const result = await finalizeCandidate(new Uint8Array(Buffer.from(encoded, "base64")), request.sourcePng, request.plan, prepared);
      return { ...result, rawCandidatePng: new Uint8Array(Buffer.from(encoded, "base64")), providerInputPng: prepared.inputPng, providerMaskPng: prepared.maskPng, providerRequestId: providerRequestId ?? `openai-extend-${crypto.randomUUID()}` };
    } catch (error) {
      if (error instanceof ImageProviderError) throw error;
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      throw new ImageProviderError(error instanceof Error ? error.message : "OpenAI Extend failed.", status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500), error instanceof OpenAI.APIError ? { providerRequestId: error.requestID ?? providerRequestId, status, code: error.code ?? undefined, type: error.type } : { providerRequestId });
    }
  }
}

export class FakeExtendProvider implements ExtendProvider {
  async extend(request: ExtendProviderRequest): Promise<ExtendProviderResult> {
    const prepared = await prepareProviderInput(request.sourcePng, request.plan, 1536);
    const blurred = await sharp(request.sourcePng).resize(request.plan.outputWidth, request.plan.outputHeight, { fit: "cover" }).blur(18).png().toBuffer();
    const candidate = await finalizeCandidate(new Uint8Array(await sharp(blurred).resize(prepared.logicalWidth, prepared.logicalHeight, { fit: "fill" }).extend({ top: prepared.logicalTop, bottom: prepared.providerHeight - prepared.logicalTop - prepared.logicalHeight, left: prepared.logicalLeft, right: prepared.providerWidth - prepared.logicalLeft - prepared.logicalWidth, background: "#777777" }).png().toBuffer()), request.sourcePng, request.plan, prepared);
    return { ...candidate, rawCandidatePng: candidate.candidatePng, providerInputPng: prepared.inputPng, providerMaskPng: prepared.maskPng, providerRequestId: `fake-extend-${crypto.randomUUID()}` };
  }
}

interface PreparedProviderInput { inputPng: Uint8Array; maskPng: Uint8Array; providerWidth: number; providerHeight: number; logicalWidth: number; logicalHeight: number; logicalLeft: number; logicalTop: number; scale: number }

export async function prepareProviderInput(sourcePng: Uint8Array, plan: SmartReframePlan, maxEdge: number): Promise<PreparedProviderInput> {
  let scale = Math.min(1, maxEdge / Math.max(plan.outputWidth, plan.outputHeight));
  if (plan.outputWidth * plan.outputHeight * scale * scale < 655_360) scale = Math.sqrt(655_360 / (plan.outputWidth * plan.outputHeight));
  const logicalWidth = Math.max(1, Math.round(plan.outputWidth * scale));
  const logicalHeight = Math.max(1, Math.round(plan.outputHeight * scale));
  const providerWidth = align16(logicalWidth);
  const providerHeight = align16(logicalHeight);
  const logicalLeft = Math.floor((providerWidth - logicalWidth) / 2);
  const logicalTop = Math.floor((providerHeight - logicalHeight) / 2);
  const crop = await sharp(sourcePng).extract({ left: plan.sourceCrop.x, top: plan.sourceCrop.y, width: plan.sourceCrop.width, height: plan.sourceCrop.height }).resize(Math.max(1, Math.round(plan.sourceCrop.width * scale)), Math.max(1, Math.round(plan.sourceCrop.height * scale)), { fit: "fill" }).png().toBuffer();
  const left = logicalLeft + Math.round(plan.sourcePlacement.x * scale);
  const top = logicalTop + Math.round(plan.sourcePlacement.y * scale);
  const inputPng = new Uint8Array(await sharp({ create: { width: providerWidth, height: providerHeight, channels: 4, background: { r: 127, g: 127, b: 127, alpha: 0 } } }).composite([{ input: crop, left, top }]).png().toBuffer());
  const seam = Math.max(0, Math.round(plan.seamWidth * scale));
  const protectedWidth = Math.max(1, Math.round(plan.sourceCrop.width * scale) - seam * 2);
  const protectedHeight = Math.max(1, Math.round(plan.sourceCrop.height * scale) - seam * 2);
  const protectedBlock = await sharp({ create: { width: protectedWidth, height: protectedHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const maskPng = new Uint8Array(await sharp({ create: { width: providerWidth, height: providerHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).composite([{ input: protectedBlock, left: left + seam, top: top + seam }]).png().toBuffer());
  return { inputPng, maskPng, providerWidth, providerHeight, logicalWidth, logicalHeight, logicalLeft, logicalTop, scale };
}

async function finalizeCandidate(candidatePng: Uint8Array, sourcePng: Uint8Array, plan: SmartReframePlan, prepared: PreparedProviderInput): Promise<{ candidatePng: Uint8Array; effectiveMaskPng: Uint8Array }> {
  const generated = await sharp(candidatePng).extract({ left: prepared.logicalLeft, top: prepared.logicalTop, width: prepared.logicalWidth, height: prepared.logicalHeight }).resize(plan.outputWidth, plan.outputHeight, { fit: "fill" }).png().toBuffer();
  const seam = plan.seamWidth;
  const core = { left: plan.sourceCrop.x + seam, top: plan.sourceCrop.y + seam, width: Math.max(1, plan.sourceCrop.width - seam * 2), height: Math.max(1, plan.sourceCrop.height - seam * 2) };
  const corePng = await sharp(sourcePng).extract(core).png().toBuffer();
  const candidate = new Uint8Array(await sharp(generated).composite([{ input: corePng, left: plan.sourcePlacement.x + seam, top: plan.sourcePlacement.y + seam }]).png().toBuffer());
  const coreMask = await sharp({ create: { width: core.width, height: core.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const effectiveMaskPng = new Uint8Array(await sharp({ create: { width: plan.outputWidth, height: plan.outputHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite([{ input: coreMask, left: plan.sourcePlacement.x + seam, top: plan.sourcePlacement.y + seam, blend: "dest-out" }]).png().toBuffer());
  return { candidatePng: candidate, effectiveMaskPng };
}

function align16(value: number): number { return Math.ceil(value / 16) * 16; }
