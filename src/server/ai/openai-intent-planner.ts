import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { editPlanSchema } from "@/shared/edit-plan";
import type { ImageEditDiagnosticSink, RequestDiagnosticError } from "@/shared/request-diagnostics";
import { ImageProviderError } from "./contracts";
import { buildPlannerInstruction, preparePlannerImages } from "./intent-planner";
import type { EditIntentPlanner, EditIntentPlannerRequest, EditIntentPlannerResult } from "./intent-planner";

export class OpenAIEditIntentPlanner implements EditIntentPlanner {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model = "gpt-5-nano-2025-08-07") {
    this.client = new OpenAI({ apiKey });
  }

  async plan(request: EditIntentPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<EditIntentPlannerResult> {
    const instruction = buildPlannerInstruction();
    const images = await preparePlannerImages(request);
    await diagnostics?.event("planner-preparation", "Prepared highlighted full-scene and selection-detail planner inputs.", {
      sourceWidth: request.width,
      sourceHeight: request.height,
    });
    await diagnostics?.artifact("planner-context.png", images.contextPng, "image/png");
    await diagnostics?.artifact("planner-selection-detail.png", images.detailPng, "image/png");
    await diagnostics?.metadata({ plannerInstruction: instruction, configuration: { plannerModel: this.model } });
    await diagnostics?.beginProviderCall("intent-planner", "openai", this.model);
    await diagnostics?.event("planner-call", "Calling the OpenAI edit-intent planner.");

    let providerRequestId: string | null = null;
    try {
      const { data: response, request_id: requestId } = await this.client.responses.parse({
        model: this.model,
        store: false,
        reasoning: { effort: "low" },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: `${instruction}\n\nUser edit instruction: ${request.prompt}` },
            { type: "input_image", image_url: pngDataUrl(images.contextPng), detail: "low" },
            { type: "input_image", image_url: pngDataUrl(images.detailPng), detail: "high" },
          ],
        }],
        text: { format: zodTextFormat(editPlanSchema, "edit_plan") },
      }).withResponse();
      providerRequestId = requestId;
      const plan = response.output_parsed;
      if (!plan) throw new ImageProviderError("The edit planner returned no usable structured plan.", false, { providerRequestId });

      const usage = flattenUsage(response.usage);
      await diagnostics?.completeProviderCall("intent-planner", providerRequestId, usage);
      await diagnostics?.event("planner-response", "Validated the structured edit plan.", {
        representation: plan.representation,
        confidence: plan.confidence,
      });
      await diagnostics?.artifact("edit-plan.json", jsonBytes(plan), "application/json");
      await diagnostics?.artifact("planner-response.json", jsonBytes({
        providerRequestId,
        responseId: response.id,
        model: response.model,
        status: response.status,
        usage: response.usage,
      }), "application/json");
      await diagnostics?.metadata({ editPlan: plan });
      return { plan, providerRequestId: providerRequestId ?? `openai-planner-unreported-${crypto.randomUUID()}` };
    } catch (error) {
      const providerError = toProviderError(error, providerRequestId);
      await diagnostics?.failProviderCall("intent-planner", toDiagnosticError(providerError), providerError.retryable, providerError.diagnostics?.providerRequestId);
      throw providerError;
    }
  }
}

function pngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

function flattenUsage(usage: unknown): Record<string, string | number | boolean | null> {
  if (!usage || typeof usage !== "object") return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

function toProviderError(error: unknown, providerRequestId: string | null): ImageProviderError {
  if (error instanceof ImageProviderError) return error;
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const retryable = status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
  return new ImageProviderError(
    error instanceof Error ? error.message : "OpenAI edit planning failed.",
    retryable,
    error instanceof OpenAI.APIError ? {
      providerRequestId: error.requestID ?? providerRequestId,
      status,
      code: error.code ?? undefined,
      type: error.type,
    } : { providerRequestId },
  );
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
