import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { extendSceneAnalysisSchema } from "@/shared/extend-plan";
import { ImageProviderError } from "./contracts";
import { buildExtendPlannerInstruction, type ExtendPlanner, type ExtendPlannerRequest, type ExtendPlannerResult } from "./extend-planner";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import sharp from "sharp";

export class OpenAIExtendPlanner implements ExtendPlanner {
  private readonly client: OpenAI;
  constructor(apiKey: string, private readonly model = "gpt-5.6-luna") { this.client = new OpenAI({ apiKey }); }

  async analyze(request: ExtendPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<ExtendPlannerResult> {
    let providerRequestId: string | null = null;
    try {
      await diagnostics?.beginProviderCall("extend-planner", "openai", this.model);
      const plannerImage = await sharp(request.imagePng).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const { data: response, request_id: requestId } = await this.client.responses.parse({
        model: this.model,
        store: false,
        reasoning: { effort: "low" },
        input: [{ role: "user", content: [
          { type: "input_text", text: buildExtendPlannerInstruction() },
          { type: "input_image", image_url: `data:image/png;base64,${plannerImage.toString("base64")}`, detail: "high" },
        ] }],
        text: { format: zodTextFormat(extendSceneAnalysisSchema, "extend_scene_analysis") },
      }).withResponse();
      providerRequestId = requestId;
      if (!response.output_parsed) throw new ImageProviderError("Smart Reframe returned no usable scene analysis.", false, { providerRequestId });
      await diagnostics?.completeProviderCall("extend-planner", providerRequestId);
      return { analysis: response.output_parsed, providerRequestId: providerRequestId ?? `openai-extend-plan-${crypto.randomUUID()}` };
    } catch (error) {
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      const providerError = error instanceof ImageProviderError ? error : new ImageProviderError(error instanceof Error ? error.message : "Smart Reframe analysis failed.", status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500), error instanceof OpenAI.APIError ? { providerRequestId: error.requestID ?? providerRequestId, status, code: error.code ?? undefined, type: error.type } : { providerRequestId });
      await diagnostics?.failProviderCall("extend-planner", { name: providerError.name, message: providerError.message, providerStatus: providerError.diagnostics?.status, providerCode: providerError.diagnostics?.code, providerType: providerError.diagnostics?.type }, providerError.retryable, providerError.diagnostics?.providerRequestId);
      throw providerError;
    }
  }
}
