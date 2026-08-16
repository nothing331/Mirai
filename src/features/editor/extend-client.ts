import { decodeImage, pixelsToDataUrl } from "./image-data";
import type { ImageVersion, ProcessingMask, ExtendInput } from "./types";
import type { ExtendSceneAnalysis, SmartReframePlan } from "@/shared/extend-plan";

export async function requestExtendPlan(version: ImageVersion, input: ExtendInput, cachedAnalysis: ExtendSceneAnalysis | null, projectId: string) {
  const form = new FormData();
  form.set("image", await imageFile(version));
  form.set("presetId", input.presetId);
  form.set("presetVersion", String(input.presetVersion));
  form.set("strategy", input.strategy);
  if (cachedAnalysis) form.set("analysis", JSON.stringify(cachedAnalysis));
  const response = await fetch("/api/image-extends/plan", { method: "POST", headers: { "x-project-id": projectId, "x-request-id": crypto.randomUUID() }, body: form });
  const payload = await response.json() as { analysis?: ExtendSceneAnalysis; plan?: SmartReframePlan; error?: string };
  if (!response.ok || !payload.analysis || !payload.plan) throw new Error(payload.error ?? "Smart Reframe planning failed.");
  return { analysis: payload.analysis, plan: payload.plan };
}

export async function requestExtendCandidate(version: ImageVersion, input: ExtendInput, analysis: ExtendSceneAnalysis, plan: SmartReframePlan, projectId: string, onPhase?: (phase: "sending" | "generating" | "preparing") => void) {
  const requestId = crypto.randomUUID();
  onPhase?.("sending");
  const form = new FormData();
  form.set("image", await imageFile(version));
  form.set("prompt", input.userPrompt.trim());
  form.set("analysis", JSON.stringify(analysis));
  form.set("plan", JSON.stringify(plan));
  onPhase?.("generating");
  const response = await fetch("/api/image-extends/generate", { method: "POST", headers: { "x-project-id": projectId, "x-request-id": requestId }, body: form });
  onPhase?.("preparing");
  const payload = await response.json() as { candidateBase64?: string; providerRequestId?: string; resolvedInstruction?: string; width?: number; height?: number; error?: string };
  if (!response.ok || !payload.candidateBase64 || !payload.providerRequestId || !payload.width || !payload.height) throw new Error(payload.error ?? "Image extension failed.");
  const candidate = await decodeBase64(payload.candidateBase64, "candidate.png");
  if (candidate.width !== payload.width || candidate.height !== payload.height) throw new Error("The Extend result dimensions are invalid.");
  const mask: ProcessingMask = { width: candidate.width, height: candidate.height, data: new Uint8ClampedArray(candidate.width * candidate.height).fill(255) };
  void uploadExtendPreview(projectId, requestId, candidate.dataUrl);
  return { ...candidate, mask, providerRequestId: payload.providerRequestId, diagnosticRequestId: requestId, resolvedInstruction: payload.resolvedInstruction ?? input.userPrompt };
}

async function imageFile(version: ImageVersion): Promise<File> {
  const dataUrl = pixelsToDataUrl(version.pixels, version.width, version.height);
  return new File([await (await fetch(dataUrl)).blob()], "image.png", { type: "image/png" });
}

async function decodeBase64(base64: string, name: string) {
  const blob = await fetch(`data:image/png;base64,${base64}`).then((result) => result.blob());
  return decodeImage(new File([blob], name, { type: "image/png" }));
}

async function uploadExtendPreview(projectId: string, requestId: string, dataUrl: string) {
  try {
    const form = new FormData();
    form.set("finalPreview", new File([await (await fetch(dataUrl)).blob()], "final-preview.png", { type: "image/png" }));
    form.set("boundaryPolicy", "review");
    const response = await fetch(`/api/request-logs/${encodeURIComponent(requestId)}/client-artifacts`, { method: "POST", headers: { "x-project-id": projectId }, body: form });
    if (!response.ok) throw new Error(`Extend preview diagnostics failed with status ${response.status}.`);
    window.dispatchEvent(new CustomEvent("request-diagnostic-updated", { detail: { requestId } }));
  } catch (error) {
    console.error(`[diagnostics:${requestId}] Extend final preview was not recorded.`, error);
  }
}
