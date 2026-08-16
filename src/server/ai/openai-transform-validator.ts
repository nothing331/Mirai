import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ImageEditDiagnosticSink, RequestDiagnosticError } from "@/shared/request-diagnostics";
import { transformFidelityAssessmentSchema } from "@/shared/transform-fidelity";
import { ImageProviderError } from "./contracts";
import { buildTransformValidatorInstruction, type TransformValidator, type TransformValidatorRequest, type TransformValidatorResult } from "./transform-validator";

export class OpenAITransformValidator implements TransformValidator {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async validate(request: TransformValidatorRequest, diagnostics?: ImageEditDiagnosticSink): Promise<TransformValidatorResult> {
    const instruction = buildTransformValidatorInstruction(request);
    await diagnostics?.metadata({ configuration: { transformValidatorModel: this.model } });
    await diagnostics?.beginProviderCall("transform-validator", "openai", this.model);
    await diagnostics?.event("transform-validator-call", "Comparing the source and candidate for semantic fidelity.");
    let providerRequestId: string | null = null;
    try {
      const { data: response, request_id: requestId } = await this.client.responses.parse({
        model: this.model,
        store: false,
        reasoning: { effort: "low" },
        input: [{ role: "user", content: [
          { type: "input_text", text: instruction },
          { type: "input_image", image_url: pngDataUrl(request.sourcePng), detail: "high" },
          { type: "input_image", image_url: pngDataUrl(request.candidatePng), detail: "high" },
        ] }],
        text: { format: zodTextFormat(transformFidelityAssessmentSchema, "transform_fidelity_assessment") },
      }).withResponse();
      providerRequestId = requestId;
      const parsed = response.output_parsed;
      if (!parsed) throw new ImageProviderError("The Transform validator returned no usable assessment.", false, { providerRequestId });
      const assessment = { ...parsed, validationAvailable: true };
      await diagnostics?.completeProviderCall("transform-validator", providerRequestId, flattenUsage(response.usage));
      await diagnostics?.event("transform-validator-response", "Validated the candidate fidelity assessment.", { verdict: assessment.verdict, confidence: assessment.confidence });
      await diagnostics?.artifact("transform-assessment.json", jsonBytes(assessment), "application/json");
      await diagnostics?.artifact("transform-validator-response.json", jsonBytes({ providerRequestId, responseId: response.id, model: response.model, status: response.status, usage: response.usage }), "application/json");
      await diagnostics?.metadata({ transformFidelityAssessment: assessment });
      return { assessment, providerRequestId: providerRequestId ?? `openai-transform-validator-unreported-${crypto.randomUUID()}` };
    } catch (error) {
      const providerError = toProviderError(error, providerRequestId);
      await diagnostics?.failProviderCall("transform-validator", toDiagnosticError(providerError), providerError.retryable, providerError.diagnostics?.providerRequestId);
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
function toProviderError(error: unknown, providerRequestId: string | null): ImageProviderError {
  if (error instanceof ImageProviderError) return error;
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  return new ImageProviderError(error instanceof Error ? error.message : "OpenAI Transform validation failed.", status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500), error instanceof OpenAI.APIError ? { providerRequestId: error.requestID ?? providerRequestId, status, code: error.code ?? undefined, type: error.type } : { providerRequestId });
}
function toDiagnosticError(error: ImageProviderError): RequestDiagnosticError { return { name: error.name, message: error.message, stack: error.stack, providerStatus: error.diagnostics?.status, providerCode: error.diagnostics?.code, providerType: error.diagnostics?.type }; }
