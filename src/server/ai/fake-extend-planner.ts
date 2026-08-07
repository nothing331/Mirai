import type { ExtendPlanner, ExtendPlannerRequest, ExtendPlannerResult } from "./extend-planner";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";

export class FakeExtendPlanner implements ExtendPlanner {
  async analyze(request: ExtendPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<ExtendPlannerResult> {
    const providerRequestId = `fake-extend-plan-${crypto.randomUUID()}`;
    await diagnostics?.beginProviderCall("extend-planner", "fake", "fake-extend-planner");
    const result: ExtendPlannerResult = {
      providerRequestId,
      analysis: {
        primarySubjects: [{ label: "main subject", bounds: { x: 0.3, y: 0.2, width: 0.4, height: 0.6 }, importance: 1, touchesEdge: false, mustPreserve: true }],
        secondarySubjects: [], textRegions: [], horizonY: 0.45, visualCenter: { x: 0.5, y: 0.5 }, negativeSpaceRegions: [],
        edgeContinuation: { top: "continue the upper background", right: "continue the right background", bottom: "continue the lower foreground", left: "continue the left background" },
        confidence: request.width > 0 && request.height > 0 ? 0.9 : 0.5, warnings: [],
      },
    };
    await diagnostics?.completeProviderCall("extend-planner", providerRequestId);
    return result;
  }
}
