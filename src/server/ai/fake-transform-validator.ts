import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import type { TransformFidelityAssessment } from "@/shared/transform-fidelity";
import type { TransformValidator, TransformValidatorRequest, TransformValidatorResult } from "./transform-validator";

export class FakeTransformValidator implements TransformValidator {
  async validate(_request: TransformValidatorRequest, diagnostics?: ImageEditDiagnosticSink): Promise<TransformValidatorResult> {
    const assessment: TransformFidelityAssessment = {
      verdict: "pass",
      subjectPreservation: 1,
      compositionPreservation: 1,
      primarySubjectsMissing: [],
      unrelatedSubjectsAdded: [],
      compositionChanges: [],
      explanation: "The deterministic fake candidate retains the source structure.",
      confidence: "high",
      validationAvailable: true,
    };
    const providerRequestId = `fake-transform-validation-${crypto.randomUUID()}`;
    await diagnostics?.beginProviderCall("transform-validator", "fake", "fake-transform-validator");
    await diagnostics?.event("transform-validator-response", "Validated deterministic Transform fidelity.", { verdict: assessment.verdict });
    await diagnostics?.artifact("transform-assessment.json", jsonBytes(assessment), "application/json");
    await diagnostics?.metadata({ transformFidelityAssessment: assessment });
    await diagnostics?.completeProviderCall("transform-validator", providerRequestId);
    return { assessment, providerRequestId };
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}
