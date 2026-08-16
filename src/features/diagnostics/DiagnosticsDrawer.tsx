"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Copy, Pin, PinOff, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DiagnosticArtifactName, RequestDiagnosticManifest, RequestDiagnosticStatus, RequestDiagnosticSummary } from "@/shared/request-diagnostics";
import { diagnosticArtifactUrl, getRequestDiagnostic, listRequestDiagnostics, setRequestDiagnosticPinned } from "./request-log-client";

const filters: Array<{ label: string; value: "all" | RequestDiagnosticStatus }> = [
  { label: "All", value: "all" },
  { label: "Live", value: "processing" },
  { label: "Passed", value: "succeeded" },
  { label: "Failed", value: "failed" },
];

const visualArtifacts: Array<{ name: DiagnosticArtifactName; label: string; note: string }> = [
  { name: "source-input.png", label: "01 / Source", note: "Exact image version entering the request" },
  { name: "selection-mask.png", label: "02 / Selection", note: "Mask drawn by the user" },
  { name: "effective-mask.png", label: "03 / Effective mask", note: "Application-owned edit coverage; Transform does not send it to the provider" },
  { name: "planner-context.png", label: "04 / Planner context", note: "Full scene with the selected region highlighted" },
  { name: "planner-selection-detail.png", label: "05 / Planner detail", note: "Close-up used to infer the selected surface" },
  { name: "provider-input.png", label: "06 / Provider input", note: "Resized image sent to the image editor" },
  { name: "provider-mask.png", label: "07 / Provider mask", note: "Provider-format transparency mask" },
  { name: "provider-candidate-raw.png", label: "08 / Raw candidate", note: "Unmodified image-editor response" },
  { name: "candidate-normalized.png", label: "09 / Normalized", note: "Provider candidate normalized to the requested editor dimensions" },
  { name: "change-map.png", label: "10 / Change map", note: "Material candidate differences measured without altering the result" },
  { name: "final-preview.png", label: "11 / Final preview", note: "Complete candidate or protected composite according to the recorded policy" },
  { name: "asset-candidate-1-raw.png", label: "A1 / Provider result", note: "Complete image returned by the creation provider" },
  { name: "asset-candidate-1.png", label: "A1 / Ready result", note: "Mode-specific output prepared for the editor" },
];

interface DiagnosticsDrawerProps {
  projectId: string | null;
  focusRequestId: string | null;
  open: boolean;
  onClose: () => void;
}

/** Presents request evidence as an inspectable timeline and visual processing contact sheet. */
export function DiagnosticsDrawer({ projectId, focusRequestId, open, onClose }: DiagnosticsDrawerProps) {
  const [filter, setFilter] = useState<"all" | RequestDiagnosticStatus>("all");
  const [requests, setRequests] = useState<RequestDiagnosticSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<RequestDiagnosticManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const wasOpenRef = useRef(false);

  const refresh = useCallback(async (preferredRequestId?: string | null) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const next = await listRequestDiagnostics(projectId, filter === "all" ? undefined : filter);
      setRequests(next);
      const target = preferredRequestId && next.some((request) => request.requestId === preferredRequestId)
        ? preferredRequestId
        : selectedIdRef.current && next.some((request) => request.requestId === selectedIdRef.current)
          ? selectedIdRef.current
          : next[0]?.requestId ?? null;
      selectedIdRef.current = target;
      setSelectedId(target);
      const nextManifest = target ? await getRequestDiagnostic(target) : null;
      if (selectedIdRef.current === target) setManifest(nextManifest);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request diagnostics could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [filter, projectId]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    const preferredRequestId = wasOpenRef.current ? null : focusRequestId;
    wasOpenRef.current = true;
    const timer = window.setTimeout(() => void refresh(preferredRequestId), 0);
    return () => window.clearTimeout(timer);
  }, [filter, focusRequestId, open, projectId, refresh]);

  useEffect(() => {
    if (!open || !requests.some((request) => request.status === "processing")) return;
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [open, refresh, requests]);

  useEffect(() => {
    if (!open) return;
    const handleUpdate = () => void refresh();
    window.addEventListener("request-diagnostic-updated", handleUpdate);
    return () => window.removeEventListener("request-diagnostic-updated", handleUpdate);
  }, [open, refresh]);

  async function selectRequest(requestId: string) {
    selectedIdRef.current = requestId;
    setSelectedId(requestId);
    setLoading(true);
    try {
      const nextManifest = await getRequestDiagnostic(requestId);
      if (selectedIdRef.current === requestId) setManifest(nextManifest);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request diagnostic could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  async function togglePinned() {
    if (!manifest) return;
    try {
      const updated = await setRequestDiagnosticPinned(manifest.requestId, !manifest.pinned);
      setManifest(updated);
      setRequests((current) => current.map((item) => item.requestId === updated.requestId ? { ...item, pinned: updated.pinned } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pin state could not be updated.");
    }
  }

  async function copy(label: string, value: string) {
    try {
      await copyText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => current === label ? null : current), 1400);
    } catch {
      setError("The browser did not allow clipboard access. Copy the manifest path manually.");
    }
  }

  const agentMessage = useMemo(() => manifest ? [
    `Inspect the provider diagnostic for project ${manifest.projectId}, request ${manifest.requestId}.`,
    `Manifest: ${manifest.bundlePath}/manifest.json`,
    `Status: ${manifest.status}${manifest.error ? ` — ${manifest.error.message}` : ""}.`,
    `Boundary policy: ${manifest.boundaryPolicy}. Preview source: ${manifest.previewSource ?? "not recorded"}.`,
    "Compare the provider candidate, normalized candidate, change map, and final preview to identify whether the provider, normalization, or application first introduced the problem.",
  ].join("\n") : "", [manifest]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Request diagnostics">
      <button className="absolute inset-0 cursor-default" aria-label="Close diagnostics" onClick={onClose} />
      <section className="relative grid h-full w-full max-w-[1180px] grid-rows-[auto_1fr] border-l border-ink bg-[#e5e2d8] shadow-[-14px_0_0_rgba(23,23,20,.22)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink bg-paper px-4 py-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.18em] text-accent">Local evidence room</p>
            <h2 className="text-xl font-bold tracking-[-.035em]">Request diagnostics</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="quiet" onClick={() => void refresh()} disabled={loading}><RefreshCw className={cn("size-3.5", loading && "animate-spin")} />Refresh</Button>
            <Button variant="outline" onClick={onClose}><X className="size-4" />Close</Button>
          </div>
        </header>

        <div className="grid min-h-0 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-ink bg-[#d5d2c8] md:border-b-0 md:border-r" aria-label="Diagnostic requests">
            <div className="sticky top-0 z-10 grid grid-cols-4 border-b border-ink bg-[#d5d2c8] p-2">
              {filters.map((item) => (
                <button key={item.value} className={cn("border border-transparent px-1 py-2 font-mono text-[9px] uppercase tracking-wider", filter === item.value && "border-ink bg-acid font-medium")} onClick={() => setFilter(item.value)}>{item.label}</button>
              ))}
            </div>
            {requests.length === 0 ? (
              <p className="p-5 text-xs leading-relaxed text-muted">{projectId ? "No generative requests match this filter yet." : "Open an image to create a project and begin recording requests."}</p>
            ) : requests.map((request, index) => (
              <button
                key={request.requestId}
                className={cn("grid w-full gap-2 border-b border-ink/25 p-3 text-left transition hover:bg-paper", selectedId === request.requestId && "bg-paper shadow-[inset_4px_0_0_#ef4b32]")}
                onClick={() => void selectRequest(request.requestId)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted">#{String(requests.length - index).padStart(2, "0")} · {request.operation ?? "pending"}</span>
                  <StatusBadge status={request.status} />
                </span>
                <code className="truncate text-[10px]">{request.requestId}</code>
                <span className="flex items-center justify-between text-[10px] text-muted">
                  <time>{new Date(request.startedAt).toLocaleString()}</time>
                  <span>{request.pinned ? <Pin className="size-3 fill-current" /> : request.durationMs === null ? "…" : `${request.durationMs}ms`}</span>
                </span>
              </button>
            ))}
          </aside>

          <div className="min-h-0 overflow-y-auto bg-paper">
            {error && <p className="m-4 border-l-4 border-accent bg-[#ffd5cc] p-3 text-xs text-[#8f1d10]">{error}</p>}
            {!manifest ? (
              <div className="grid h-full place-items-center p-10 text-center"><p className="max-w-sm text-sm text-muted">Select a request to inspect its processing trail and image artifacts.</p></div>
            ) : (
              <div className="grid gap-6 p-4 md:p-6">
                <section className="grid gap-4 border border-ink bg-[#171714] p-4 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 flex items-center gap-2"><StatusBadge status={manifest.status} /><span className="font-mono text-[9px] uppercase tracking-widest text-[#aaa79e]">{manifest.provider} · {manifest.operation} · {manifest.boundaryPolicy}</span></div>
                      <h3 className="max-w-2xl text-lg font-bold leading-tight">{manifest.error?.message ?? "Request completed with a reproducible evidence bundle."}</h3>
                    </div>
                    <Button variant="outline" className="border-white text-white hover:shadow-[3px_3px_0_#d8f441]" onClick={() => void togglePinned()}>
                      {manifest.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{manifest.pinned ? "Unpin" : "Pin evidence"}
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Identifier label="Project ID" value={manifest.projectId} copied={copied} onCopy={copy} />
                    <Identifier label="Request ID" value={manifest.requestId} copied={copied} onCopy={copy} />
                    {manifest.providerRequestId && <Identifier label="Provider request" value={manifest.providerRequestId} copied={copied} onCopy={copy} />}
                    {manifest.retryOfRequestId && <Identifier label="Retry of" value={manifest.retryOfRequestId} copied={copied} onCopy={copy} />}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-white/20 pt-3">
                    <Button variant="accent" onClick={() => void copy("agent", agentMessage)}>{copied === "agent" ? <Check className="size-4" /> : <Clipboard className="size-4" />}{copied === "agent" ? "Copied" : "Copy for coding agent"}</Button>
                    <Button variant="outline" className="min-w-0 border-white text-white hover:shadow-[3px_3px_0_white]" onClick={() => void copy("path", `${manifest.bundlePath}/manifest.json`)}>
                      {copied === "path" ? <Check className="size-4" /> : <Copy className="size-4" />}<span className="max-w-[360px] truncate">manifest.json path</span>
                    </Button>
                  </div>
                </section>

                <section>
                  <SectionHeading index="A" title="Visual chain of custody" subtitle="The first visibly incorrect frame usually identifies the failing stage." />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visualArtifacts.map((artifact) => {
                      const exists = Boolean(manifest.artifacts[artifact.name]);
                      return (
                        <figure key={artifact.name} className={cn("grid grid-rows-[auto_180px_auto] border border-ink bg-[#d9d6cc]", !exists && "opacity-45")}>
                          <figcaption className="border-b border-ink bg-paper px-3 py-2 font-mono text-[9px] uppercase tracking-wider">{artifact.label}</figcaption>
                          <div className="relative m-2 overflow-hidden bg-[linear-gradient(45deg,#c9c6bc_25%,transparent_25%),linear-gradient(-45deg,#c9c6bc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#c9c6bc_75%),linear-gradient(-45deg,transparent_75%,#c9c6bc_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]">
                            {exists ? <Image src={diagnosticArtifactUrl(manifest.requestId, artifact.name)} alt={artifact.label} fill unoptimized className="object-contain" /> : <span className="absolute inset-0 grid place-items-center font-mono text-[9px] uppercase tracking-wider text-muted">Not produced</span>}
                          </div>
                          <p className="border-t border-ink/20 px-3 py-2 text-[10px] leading-relaxed text-muted">{artifact.note}</p>
                        </figure>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <SectionHeading index="B" title="Provider calls" subtitle={`${manifest.providerCalls.length} recorded call${manifest.providerCalls.length === 1 ? "" : "s"} in this logical request.`} />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {manifest.providerCalls.map((call) => (
                      <article key={call.stage} className="border border-ink bg-[#e6e3da] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <strong className="font-mono text-[10px] uppercase tracking-wider">{call.stage.replace("-", " ")}</strong>
                          <StatusBadge status={call.status === "processing" ? "processing" : call.status === "succeeded" ? "succeeded" : "failed"} />
                        </div>
                        <dl className="mt-3 grid grid-cols-2 border border-ink/40">
                          <Fact label="Provider" value={call.provider} />
                          <Fact label="Model" value={call.model} />
                          <Fact label="Duration" value={call.durationMs === null ? "Live" : `${call.durationMs}ms`} />
                          <Fact label="Retryable" value={call.retryable === null ? "—" : String(call.retryable)} />
                        </dl>
                        {call.providerRequestId && <div className="mt-2 border border-ink bg-[#171714] text-white"><Identifier label="Provider request" value={call.providerRequestId} copied={copied} onCopy={copy} /></div>}
                        {Object.keys(call.usage).length > 0 && <p className="mt-2 break-words font-mono text-[9px] text-muted">Usage · {Object.entries(call.usage).map(([key, value]) => `${key}=${value}`).join(" · ")}</p>}
                        {call.error && <p className="mt-2 border-l-4 border-accent bg-[#fff0eb] p-2 text-[10px] text-[#8f1d10]">{call.error.message}</p>}
                      </article>
                    ))}
                    {manifest.providerCalls.length === 0 && <p className="border border-ink/30 bg-[#e6e3da] p-3 text-xs text-muted">This legacy bundle predates per-provider call tracking.</p>}
                  </div>
                </section>

                {manifest.candidateAnalysis && (
                  <section>
                    <SectionHeading index="B2" title="Candidate scope diagnosis" subtitle="Measured evidence only; this analysis never changes preview pixels." />
                    <dl className="mt-3 grid grid-cols-2 border border-ink md:grid-cols-4">
                      <Fact label="Classification" value={manifest.candidateAnalysis.classification} />
                      <Fact label="Changed pixels" value={String(manifest.candidateAnalysis.changedPixels)} />
                      <Fact label="Inside selection" value={`${Math.round(manifest.candidateAnalysis.changedInsideSelectionRatio * 1000) / 10}%`} />
                      <Fact label="Outside selection" value={`${Math.round(manifest.candidateAnalysis.changedOutsideSelectionRatio * 1000) / 10}%`} />
                    </dl>
                    {manifest.candidateAnalysis.warnings.length > 0 && <p className="mt-3 border-l-4 border-[#d98b00] bg-[#fff0c7] p-3 text-xs text-[#6f4300]">{manifest.candidateAnalysis.warnings.join(" · ")}</p>}
                  </section>
                )}

                {manifest.transformFidelityAssessment && (
                  <section>
                    <SectionHeading index="B3" title="Transform fidelity" subtitle="Semantic source-versus-candidate validation; the complete provider proposal remains unchanged." />
                    <dl className="mt-3 grid grid-cols-2 border border-ink md:grid-cols-4">
                      <Fact label="Verdict" value={manifest.transformFidelityAssessment.verdict} />
                      <Fact label="Confidence" value={manifest.transformFidelityAssessment.confidence} />
                      <Fact label="Subject preservation" value={`${Math.round(manifest.transformFidelityAssessment.subjectPreservation * 100)}%`} />
                      <Fact label="Composition preservation" value={`${Math.round(manifest.transformFidelityAssessment.compositionPreservation * 100)}%`} />
                    </dl>
                    <p className={cn("mt-3 border-l-4 p-3 text-xs", manifest.transformFidelityAssessment.verdict === "block" ? "border-accent bg-[#fff0eb] text-[#8f1d10]" : manifest.transformFidelityAssessment.verdict === "warning" ? "border-[#d98b00] bg-[#fff0c7] text-[#6f4300]" : "border-[#586700] bg-[#edf5c4] text-[#394300]")}>{manifest.transformFidelityAssessment.explanation}</p>
                  </section>
                )}

                <section>
                  <SectionHeading index="C" title="Processing timeline" subtitle={`${manifest.durationMs ?? "Live"}${typeof manifest.durationMs === "number" ? "ms total" : ""}`} />
                  <ol className="mt-3 border border-ink">
                    {manifest.events.map((event, index) => (
                      <li key={event.id} className="grid grid-cols-[28px_1fr_auto] gap-3 border-b border-ink/20 bg-[#e6e3da] p-3 last:border-b-0">
                        <span className={cn("grid size-6 place-items-center border border-ink font-mono text-[9px]", event.level === "error" ? "bg-accent text-white" : "bg-acid")}>{String(index + 1).padStart(2, "0")}</span>
                        <div><strong className="text-xs">{event.message}</strong><p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted">{event.stage}{event.details ? ` · ${Object.entries(event.details).map(([key, value]) => `${key}=${value}`).join(" · ")}` : ""}</p></div>
                        <time className="font-mono text-[9px] text-muted">{new Date(event.timestamp).toLocaleTimeString()}</time>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <SectionHeading index="D" title="Prompt evidence" subtitle="User intent, contextual interpretation, and the exact image-editor instruction." />
                    <dl className="mt-3 grid gap-3">
                      <EvidenceText label="User prompt" value={manifest.userPrompt || "(empty removal context)"} />
                      {manifest.plannerInstruction && <EvidenceText label="Planner instruction" value={manifest.plannerInstruction} />}
                      {manifest.editPlan && <EvidenceText label="Structured edit plan" value={JSON.stringify(manifest.editPlan, null, 2)} />}
                      {manifest.transformPlan && <EvidenceText label="Transform source plan" value={JSON.stringify(manifest.transformPlan, null, 2)} />}
                      <EvidenceText label="Image-editor instruction" value={manifest.providerInstruction ?? "Not constructed before failure."} />
                    </dl>
                  </div>
                  <div>
                    <SectionHeading index="E" title="Request facts" subtitle="Configuration and dimensions used for this attempt." />
                    <dl className="mt-3 grid grid-cols-2 border border-ink">
                      <Fact label="Source" value={manifest.sourceDimensions ? `${manifest.sourceDimensions.width} × ${manifest.sourceDimensions.height}` : "Unknown"} />
                      <Fact label="Provider" value={manifest.providerDimensions ? `${manifest.providerDimensions.width} × ${manifest.providerDimensions.height}` : "Unknown"} />
                      <Fact label="Boundary policy" value={manifest.boundaryPolicy} />
                      <Fact label="Preview source" value={manifest.previewSource ?? "Not prepared"} />
                      {Object.entries(manifest.configuration).map(([key, value]) => <Fact key={key} label={key} value={String(value)} />)}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {manifest.artifacts["planner-response.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "planner-response.json")} target="_blank" rel="noreferrer">Open planner response ↗</a>}
                      {manifest.artifacts["edit-plan.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "edit-plan.json")} target="_blank" rel="noreferrer">Open edit plan ↗</a>}
                      {manifest.artifacts["transform-plan.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "transform-plan.json")} target="_blank" rel="noreferrer">Open Transform plan ↗</a>}
                      {manifest.artifacts["transform-assessment.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "transform-assessment.json")} target="_blank" rel="noreferrer">Open fidelity assessment ↗</a>}
                      {manifest.artifacts["transform-validator-response.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "transform-validator-response.json")} target="_blank" rel="noreferrer">Open validator response ↗</a>}
                      {manifest.artifacts["extend-scene-analysis.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "extend-scene-analysis.json")} target="_blank" rel="noreferrer">Open Extend analysis ↗</a>}
                      {manifest.artifacts["extend-plan.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "extend-plan.json")} target="_blank" rel="noreferrer">Open Extend plan ↗</a>}
                      {manifest.artifacts["provider-response.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "provider-response.json")} target="_blank" rel="noreferrer">Open image response ↗</a>}
                      {manifest.artifacts["candidate-analysis.json"] && <a className="inline-flex border-b border-ink font-mono text-[10px] uppercase tracking-wider hover:bg-acid" href={diagnosticArtifactUrl(manifest.requestId, "candidate-analysis.json")} target="_blank" rel="noreferrer">Open candidate analysis ↗</a>}
                    </div>
                    {manifest.error?.stack && <details className="mt-4 border border-accent bg-[#fff0eb] p-3"><summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-[#8f1d10]">Server error stack</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-[10px] leading-relaxed">{manifest.error.stack}</pre></details>}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: RequestDiagnosticStatus }) {
  return <span className={cn("border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider", status === "succeeded" ? "border-[#586700] bg-acid text-ink" : status === "failed" ? "border-[#8f1d10] bg-accent text-white" : "animate-pulse border-[#6f4300] bg-[#fff0c7] text-[#6f4300]")}>{status}</span>;
}

function Identifier({ label, value, copied, onCopy }: { label: string; value: string; copied: string | null; onCopy: (label: string, value: string) => Promise<void> }) {
  return <button className="group flex min-w-0 items-center gap-2 border border-white/25 p-2 text-left hover:border-acid" onClick={() => void onCopy(label, value)}><span className="shrink-0 font-mono text-[8px] uppercase tracking-widest text-[#aaa79e]">{label}</span><code className="min-w-0 flex-1 truncate text-[10px]">{value}</code>{copied === label ? <Check className="size-3.5 text-acid" /> : <Copy className="size-3.5 opacity-55 group-hover:opacity-100" />}</button>;
}

function SectionHeading({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
  return <div className="grid grid-cols-[24px_1fr] gap-2 border-b border-ink pb-2"><span className="font-mono text-[9px] text-accent">{index}</span><div><h3 className="text-base font-bold tracking-tight">{title}</h3><p className="text-[10px] text-muted">{subtitle}</p></div></div>;
}

function EvidenceText({ label, value }: { label: string; value: string }) {
  return <div className="border border-ink"><dt className="border-b border-ink bg-[#d5d2c8] px-3 py-2 font-mono text-[9px] uppercase tracking-wider">{label}</dt><dd className="m-0 max-h-52 overflow-y-auto whitespace-pre-wrap p-3 text-xs leading-relaxed">{value}</dd></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-r border-ink/20 p-3"><dt className="font-mono text-[8px] uppercase tracking-wider text-muted">{label}</dt><dd className="m-0 mt-1 break-words text-xs font-semibold">{value}</dd></div>;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // The local app may run in a browser context without clipboard permission.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access was denied.");
}
