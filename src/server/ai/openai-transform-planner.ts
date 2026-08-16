import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ImageEditDiagnosticSink, RequestDiagnosticError } from "@/shared/request-diagnostics";
import { transformPlanSchema } from "@/shared/transform-fidelity";
import { ImageProviderError } from "./contracts";
import { buildTransformPlannerInstruction, type TransformPlanner, type TransformPlannerRequest, type TransformPlannerResult } from "./transform-planner";

export class OpenAITransformPlanner implements TransformPlanner {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async plan(request: TransformPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<TransformPlannerResult> {
    const instruction = buildTransformPlannerInstruction();
    await diagnostics?.metadata({ plannerInstruction: instruction, configuration: { transformPlannerModel: this.model } });
    await diagnostics?.beginProviderCall("transform-planner", "openai", this.model);
    await diagnostics?.event("transform-planner-call", "Calling the OpenAI full-image preservation planner.");
    let providerRequestId: string | null = null;
    try {
      const { data: response, request_id: requestId } = await this.client.responses.parse({
        model: this.model,
        store: false,
        reasoning: { effort: "low" },
        input: [{ role: "user", content: [
          { type: "input_text", text: instruction },
          { type: "input_image", image_url: pngDataUrl(request.imagePng), detail: "high" },
        ] }],
        text: { format: zodTextFormat(transformPlanSchema, "transform_plan") },
      }).withResponse();
      providerRequestId = requestId;
      const plan = response.output_parsed;
      if (!plan) throw new ImageProviderError("The Transform planner returned no usable source plan.", false, { providerRequestId });
      await diagnostics?.completeProviderCall("transform-planner", providerRequestId, flattenUsage(response.usage));
      await diagnostics?.event("transform-planner-response", "Validated the structured full-image preservation plan.", { confidence: plan.confidence });
      await diagnostics?.artifact("transform-plan.json", jsonBytes(plan), "application/json");
      await diagnostics?.artifact("planner-response.json", jsonBytes({ providerRequestId, responseId: response.id, model: response.model, status: response.status, usage: response.usage }), "application/json");
      await diagnostics?.metadata({ transformPlan: plan });
      return { plan, providerRequestId: providerRequestId ?? `openai-transform-planner-unreported-${crypto.randomUUID()}` };
    } catch (error) {
      const providerError = toProviderError(error, providerRequestId, "OpenAI Transform planning failed.");
      await diagnostics?.failProviderCall("transform-planner", toDiagnosticError(providerError), providerError.retryable, providerError.diagnostics?.providerRequestId);
      throw providerError;
    }
  }
}

function pngDataUrl(bytes: Uint8Array): string { return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`; }
function jsonBytes(value: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(value, null, 2)); }
function flattenUsage(usage: unknown): Record<string, string | number | boolean | null> {
  if (!usage || typeof usage !== "object") return {};
  return Object.fromEntries(Object.entries(usage).filter((entry): entry is [string, string | number | boolean | null] => ["string", "number", "boolean"].includes(typeof entry[1]) || entry[1] === null));
}
function toProviderError(error: unknown, providerRequestId: string | null, fallback: string): ImageProviderError {
  if (error instanceof ImageProviderError) return error;
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  return new ImageProviderError(error instanceof Error ? error.message : fallback, status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500), error instanceof OpenAI.APIError ? { providerRequestId: error.requestID ?? providerRequestId, status, code: error.code ?? undefined, type: error.type } : { providerRequestId });
}
function toDiagnosticError(error: ImageProviderError): RequestDiagnosticError { return { name: error.name, message: error.message, stack: error.stack, providerStatus: error.diagnostics?.status, providerCode: error.diagnostics?.code, providerType: error.diagnostics?.type }; }
