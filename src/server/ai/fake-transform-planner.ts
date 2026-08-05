import type { TransformPlan } from "@/shared/transform-fidelity";
import type { TransformPlanner, TransformPlannerRequest, TransformPlannerResult } from "./transform-planner";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";

export class FakeTransformPlanner implements TransformPlanner {
  async plan(request: TransformPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<TransformPlannerResult> {
    const plan: TransformPlan = {
      sourceSummary: `A source image with ${request.width}×${request.height} pixel framing`,
      primarySubjects: [{ description: "the visible primary source subject", count: 1, position: "in its original location", poseOrGeometry: "its original silhouette and orientation", identityCues: ["source-visible shape", "source-visible details"] }],
      composition: { framing: "the original full-image framing", cameraAngle: "the original camera angle", spatialRelationships: ["retain all original subject relationships"], backgroundStructure: ["retain the original environment"] },
      mustPreserve: ["primary subject category", "subject count", "principal composition"],
      prohibitedChanges: ["no unrelated primary subjects", "no replacement scene"],
      confidence: "high",
    };
    const providerRequestId = `fake-transform-plan-${crypto.randomUUID()}`;
    await diagnostics?.beginProviderCall("transform-planner", "fake", "fake-transform-planner");
    await diagnostics?.event("transform-planner-response", "Created a deterministic full-image preservation plan.");
    await diagnostics?.artifact("transform-plan.json", jsonBytes(plan), "application/json");
    await diagnostics?.metadata({ transformPlan: plan });
    await diagnostics?.completeProviderCall("transform-planner", providerRequestId);
    return { plan, providerRequestId };
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}
