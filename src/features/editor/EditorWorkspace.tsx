"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { ChangeEvent, useEffect, useState } from "react";
import { Activity, Brush, Check, Copy, Download, Eraser, Focus, FolderOpen, Hand, ImagePlus, LassoSelect, Redo2, RotateCcw, Save, Sparkles, Trash2, Undo2, WandSparkles, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DiagnosticsDrawer } from "@/features/diagnostics/DiagnosticsDrawer";
import { cn } from "@/lib/utils";
import type { CandidateAnalysis, EditBoundaryPolicy } from "@/shared/edit-boundary";
import { decodeImage, exportVersion } from "./image-data";
import { maskHasSelection } from "./mask";
import { listSavedProjects, openSavedProject, saveEditorProject, type SavedProjectSummary } from "./project-client";
import { getCurrentVersion, useEditorStore } from "./store";
import type { Tool } from "./types";
import type { EditType, FakeScenario } from "./types";

const EditorCanvas = dynamic(() => import("./EditorCanvas").then((module) => module.EditorCanvas), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center font-mono text-xs text-white">Preparing canvas…</div>,
});

const tools: Array<{ value: Tool; label: string; icon: typeof Brush }> = [
  { value: "lasso", label: "Lasso", icon: LassoSelect },
  { value: "brush", label: "Brush", icon: Brush },
  { value: "eraser", label: "Eraser", icon: Eraser },
  { value: "pan", label: "Pan", icon: Hand },
];

const editTypes: Array<{ value: EditType; label: string }> = [
  { value: "recolor", label: "Recolor" },
  { value: "remove", label: "Remove" },
  { value: "replace", label: "Add / replace" },
  { value: "restyle", label: "Restyle" },
];

interface ProviderCapabilities {
  provider: "fake" | "openai";
  fakeScenarios: boolean;
  plannerModel: string;
  imageModel: string;
  quality: string | null;
  maxInputEdge: number | null;
  maxRealRequestsPerSession: number;
}

/** Composes upload, closed-region selection, preview, and acceptance controls. */
export function EditorWorkspace() {
  const state = useEditorStore();
  const currentVersion = getCurrentVersion(state);
  const originalVersion = state.versions.find((version) => version.id === state.originalVersionId) ?? null;
  const [loading, setLoading] = useState(false);
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapabilities | null>(null);
  const [realRequestsUsed, setRealRequestsUsed] = useState(0);
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [compareWith, setCompareWith] = useState<"original" | "previous">("original");
  const [exportFormat, setExportFormat] = useState<"image/png" | "image/jpeg">("image/png");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/image-edits").then((response) => response.json()).then((capabilities: ProviderCapabilities) => setProviderCapabilities(capabilities)).catch(() => setProviderCapabilities(null));
    listSavedProjects().then(setSavedProjects).catch(() => setSavedProjects([]));
    const restoreUsage = window.setTimeout(() => {
      const storedUsage = Number.parseInt(sessionStorage.getItem("local-edit-real-requests") ?? "0", 10);
      if (Number.isFinite(storedUsage) && storedUsage > 0) setRealRequestsUsed(storedUsage);
    }, 0);
    return () => window.clearTimeout(restoreUsage);
  }, []);

  useEffect(() => {
    const releaseUnusedGeneration = () => {
      setRealRequestsUsed((current) => {
        const nextUsage = Math.max(0, current - 1);
        sessionStorage.setItem("local-edit-real-requests", String(nextUsage));
        return nextUsage;
      });
    };
    window.addEventListener("image-generation-skipped", releaseUnusedGeneration);
    return () => window.removeEventListener("image-generation-skipped", releaseUnusedGeneration);
  }, []);

  /** Confirms and counts a paid request before allowing it to reach the real provider. */
  function authorizeProviderRequest(label: string): boolean {
    if (providerCapabilities?.provider !== "openai") return true;
    if (realRequestsUsed >= providerCapabilities.maxRealRequestsPerSession) {
      state.setError(`The session limit of ${providerCapabilities.maxRealRequestsPerSession} real API requests has been reached.`);
      return false;
    }
    const confirmed = window.confirm(`${label} will run context planning and, if planning succeeds, one paid OpenAI image request.\n\nPlanner: ${providerCapabilities.plannerModel}\nImage model: ${providerCapabilities.imageModel}\nQuality: ${providerCapabilities.quality}\nMaximum input edge: ${providerCapabilities.maxInputEdge}px\nSession usage after confirmation: ${realRequestsUsed + 1}/${providerCapabilities.maxRealRequestsPerSession}`);
    if (confirmed) {
      const nextUsage = realRequestsUsed + 1;
      setRealRequestsUsed(nextUsage);
      sessionStorage.setItem("local-edit-real-requests", String(nextUsage));
    }
    return confirmed;
  }

  /** Validates free client-side requirements before showing a paid-call confirmation. */
  async function handleGeneratePreview() {
    const ready = state.selectionMask && maskHasSelection(state.selectionMask) && (state.editType === "remove" || ((state.editType === "replace" || state.editType === "restyle") && state.prompt.trim().length > 0));
    if (!ready || authorizeProviderRequest("Generate preview")) await state.requestGenerativePreview();
  }

  function handleSelectionPreview() {
    if (state.editType === "recolor") state.createPreview();
    else void handleGeneratePreview();
  }

  /** Keeps retries manual and applies the same confirmation and session budget. */
  async function handleRetryPreview() {
    if (authorizeProviderRequest("Retry preview")) await state.retryGenerativePreview();
  }

  /** Validates and decodes a local image without uploading it to a server. */
  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLoading(true);
    state.setError(null);
    try {
      state.loadImage(await decodeImage(file));
      setRealRequestsUsed(0);
      sessionStorage.removeItem("local-edit-real-requests");
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "The image could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setLoading(true);
    try { await saveEditorProject(state); setSavedProjects(await listSavedProjects()); state.setError(null); }
    catch (error) { state.setError(error instanceof Error ? error.message : "The project could not be saved."); }
    finally { setLoading(false); }
  }

  async function handleOpen(id: string) {
    if (!id) return;
    setLoading(true);
    try { state.restoreProject(await openSavedProject(id)); }
    catch (error) { state.setError(error instanceof Error ? error.message : "The project could not be opened."); }
    finally { setLoading(false); }
  }

  const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
  const comparisonVersion = compareWith === "previous" && currentIndex > 0 ? state.versions[currentIndex - 1] : originalVersion;

  return (
    <>
    <main className="h-dvh overflow-hidden bg-[#cfcdc5] text-ink">
      <header className="flex h-14 items-center justify-between border-b border-ink bg-paper px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center bg-ink font-mono text-[10px] font-medium text-acid" aria-hidden="true">LE</span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-none tracking-[-.025em]">Local Edit</h1>
            <p className="mt-1 hidden font-mono text-[9px] uppercase tracking-[.14em] text-muted sm:block">Non-destructive image workspace</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[.1em] text-muted">
          {state.projectId && <IdChip label="Project" value={state.projectId} />}
          {state.lastRequestId && <IdChip label="Request" value={state.lastRequestId} />}
          <Button variant="quiet" className="h-8 px-2 text-[9px]" disabled={!state.projectId} onClick={() => setDiagnosticsOpen(true)}><Activity className="size-3.5" />Diagnostics</Button>
          <span className={cn("hidden size-2 rounded-full sm:inline", currentVersion ? "bg-acid ring-1 ring-ink" : "bg-line")} aria-hidden="true" />
          <span className="hidden sm:inline">{currentVersion ? "Ready" : "Empty"}</span>
        </div>
      </header>

      <section className="grid h-[calc(100dvh-3.5rem)] min-h-0 grid-rows-[minmax(300px,1.15fr)_minmax(0,.85fr)] md:grid-cols-[272px_minmax(0,1fr)] md:grid-rows-1">
        <aside className="order-2 min-h-0 overflow-y-auto overscroll-contain border-t border-ink bg-paper px-4 md:order-1 md:border-r md:border-t-0" aria-label="Editor tools">
          <ControlSection number="01" title="Open" subtitle="PNG or JPEG" className="pt-0">
            <label className={cn(buttonVariants(), "relative w-full cursor-pointer")}>
              <ImagePlus className="size-4" />
              {loading ? "Opening…" : currentVersion ? "Replace image" : "Choose image"}
              <input data-testid="file-input" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={handleUpload} disabled={loading} />
            </label>
            <input aria-label="Project name" className="h-10 border border-ink bg-transparent px-2 text-xs" value={state.projectName} onChange={(event) => state.setProjectName(event.target.value)} disabled={!currentVersion} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!currentVersion || loading} onClick={() => void handleSave()}><Save className="size-4" />Save</Button>
              <label className="grid grid-cols-[auto_1fr] items-center gap-2 border border-ink px-2 text-xs"><FolderOpen className="size-4" /><select aria-label="Open saved project" className="min-w-0 bg-transparent py-2" value="" onChange={(event) => void handleOpen(event.target.value)}><option value="">Open…</option>{savedProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            </div>
          </ControlSection>

          <fieldset disabled={!currentVersion} className="m-0 grid min-w-0 border-0 p-0 disabled:opacity-45 max-md:grid-cols-2 max-md:gap-4 max-sm:grid-cols-1">
            <ControlSection number="02" title="Select" subtitle="Draw around the area to recolor">
              <ToggleGroup className="grid-cols-4" type="single" value={state.tool} onValueChange={(value) => value && state.setTool(value as Tool)} aria-label="Selection tool">
                {tools.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem key={value} value={value} aria-label={label}><Icon className="size-3.5" />{label}</ToggleGroupItem>
                ))}
              </ToggleGroup>

              {state.tool === "lasso" && (
                <p className="border-l-2 border-accent pl-2 text-xs leading-relaxed text-muted">Draw loosely around an object or area. The contour is cleaned conservatively when you release the pointer.</p>
              )}

              {state.editType !== "recolor" && (
                <label className="grid gap-1.5 text-xs">
                  <span>AI edit behavior</span>
                  <select
                    aria-label="AI edit behavior"
                    className="h-10 border border-ink bg-paper px-2 text-xs"
                    value={state.boundaryPolicy}
                    onChange={(event) => state.setBoundaryPolicy(event.target.value as EditBoundaryPolicy)}
                  >
                    <option value="review">Let AI blend naturally</option>
                    <option value="protected">Protect outside selection</option>
                  </select>
                </label>
              )}

              {state.selectionDiagnostics && (
                <div className="grid gap-1 border border-line bg-[#e8e5dc] p-2.5 font-mono text-[9px] uppercase tracking-[.08em] text-muted" data-testid="selection-diagnostics">
                  <div className="flex items-center justify-between"><span>Selection cleanup</span><strong className="text-ink">{state.selectionDiagnostics.rawPointCount} → {state.selectionDiagnostics.cleanedPointCount} points</strong></div>
                  <div className="flex items-center justify-between"><span>Spikes removed</span><strong className="text-ink">{state.selectionDiagnostics.removedSpikeCount}</strong></div>
                  {state.selectionDiagnostics.warnings.length > 0 && <span className="mt-1 border-l-2 border-[#d98b00] pl-2 normal-case tracking-normal text-[#795000]">Original contour preserved where automatic cleanup was uncertain.</span>}
                </div>
              )}

              {(state.tool === "brush" || state.tool === "eraser") && (
                <p className="border-l-2 border-accent pl-2 text-xs leading-relaxed text-muted">Use {state.tool === "brush" ? "Brush to add missed pixels to" : "Eraser to remove unwanted pixels from"} the filled selection.</p>
              )}

              <div className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                <span>Brush size</span><output className="font-mono text-[11px]">{state.brushSize}px</output>
                <Slider className="col-span-2 py-2" min={4} max={160} step={1} value={[state.brushSize]} onValueChange={([value]) => state.setBrushSize(value)} aria-label="Brush size" />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                <span>Edge softness</span><output className="font-mono text-[11px]">{Math.round(state.maskSoftness * 100)}%</output>
                <Slider className="col-span-2 py-2" min={0} max={0.8} step={0.05} value={[state.maskSoftness]} onValueChange={([value]) => state.setMaskSoftness(value)} aria-label="Edge softness" />
              </div>

              {state.tool === "pan" && (
                <p className="border-l-2 border-accent pl-2 text-xs leading-relaxed text-muted">Pan lets you drag the image around the workspace without painting on it. It is useful after zooming in.</p>
              )}

              <Button variant="quiet" onClick={state.clearSelection}><Trash2 className="size-3.5" />Clear selection</Button>
              <Button variant="quiet" onClick={state.requestViewReset}><Focus className="size-3.5" />Reset view</Button>
            </ControlSection>

            <ControlSection number="03" title="Edit" subtitle="Choose a local or generative operation">
              <ToggleGroup type="single" value={state.editType} onValueChange={(value) => value && state.setEditType(value as EditType)} aria-label="Edit operation">
                {editTypes.map((edit) => <ToggleGroupItem key={edit.value} value={edit.value}>{edit.label}</ToggleGroupItem>)}
              </ToggleGroup>

              {state.editType === "recolor" ? (
                <label className="flex h-12 items-center gap-3 border border-ink p-1 font-mono text-[11px]">
                  <input aria-label="Recolor" className="h-9 w-10 cursor-pointer border-0 bg-transparent p-0" type="color" value={state.color} onChange={(event) => state.setColor(event.target.value)} />
                  <span>{state.color.toUpperCase()}</span>
                </label>
              ) : (
                <label className="grid gap-1.5 text-xs">
                  <span>{state.editType === "replace" ? "What should be added or replaced?" : state.editType === "restyle" ? "Restyle instruction" : "Optional removal context"}</span>
                  <textarea
                    aria-label="Edit instruction"
                    className="min-h-20 resize-y border border-ink bg-transparent p-2 text-xs outline-none focus:ring-2 focus:ring-accent"
                    value={state.prompt}
                    placeholder={state.editType === "replace" ? "Example: add a complete swimming pool contained inside this area" : state.editType === "restyle" ? "Example: turn this into brushed copper" : "Example: reconstruct the brick wall behind it"}
                    onChange={(event) => state.setPrompt(event.target.value)}
                  />
                </label>
              )}

              {providerCapabilities?.fakeScenarios && state.editType !== "recolor" && (
                <label className="grid gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                  Fake provider scenario
                  <select className="h-10 border border-line bg-paper px-2 text-xs text-ink" value={state.fakeScenario} onChange={(event) => state.setFakeScenario(event.target.value as FakeScenario)}>
                    <option value="success">Success</option>
                    <option value="slow">Slow success</option>
                    <option value="retryable-error">Retryable failure</option>
                    <option value="fatal-error">Permanent failure</option>
                  </select>
                </label>
              )}

              {providerCapabilities?.provider === "openai" && state.editType !== "recolor" && (
                <div className="grid gap-1 border-l-4 border-[#d98b00] bg-[#fff0c7] p-3 text-xs text-[#6f4300]" role="status">
                  <strong>Real OpenAI API enabled</strong>
                  <span>Paid requests: {realRequestsUsed}/{providerCapabilities.maxRealRequestsPerSession} this browser session</span>
                  <span>{providerCapabilities.quality} quality · max {providerCapabilities.maxInputEdge}px edge</span>
                </div>
              )}

              {state.editType === "recolor" ? (
                <Button data-testid="apply-edit" variant="accent" onClick={state.createPreview}>Preview recolor</Button>
              ) : (
                <Button data-testid="generate-edit" variant="accent" disabled={state.generativeState.status === "processing" || (providerCapabilities?.provider === "openai" && realRequestsUsed >= providerCapabilities.maxRealRequestsPerSession)} onClick={() => void handleGeneratePreview()}>
                  {state.generativeState.status === "processing" ? <><Sparkles className="size-4 animate-pulse" />Processing…</> : <><WandSparkles className="size-4" />Generate preview</>}
                </Button>
              )}

              {state.generativeState.status === "failed" && (
                <div className="grid gap-2 border-l-4 border-accent bg-[#ffd5cc] p-3 text-xs text-[#8f1d10]">
                  <span>{state.generativeState.error}</span>
                  <code className="break-all font-mono text-[9px]">Request {state.generativeState.snapshot.requestId}</code>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setDiagnosticsOpen(true)}><Activity className="size-3.5" />View diagnostics</Button>
                    {state.generativeState.retryable && <Button variant="outline" onClick={() => void handleRetryPreview()}>Retry same request</Button>}
                  </div>
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-muted">{state.boundaryPolicy === "review" ? "The selection is an approximate focus hint. Mirai preserves the complete AI proposal and highlights changes beyond the selection for review." : "The selection is a strict boundary. Mirai restores source pixels outside the protected mask, which can clip generated content that crosses it."}</p>
              <Button variant="quiet" onClick={state.reset}><RotateCcw className="size-3.5" />Reset to original</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button data-testid="undo" variant="quiet" disabled={!state.canUndo()} onClick={state.undo}><Undo2 className="size-3.5" />Undo</Button>
                <Button data-testid="redo" variant="quiet" disabled={!state.canRedo()} onClick={state.redo}><Redo2 className="size-3.5" />Redo</Button>
              </div>
              <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">Compare with<select aria-label="Comparison base" className="h-9 border border-line bg-paper px-2" value={compareWith} onChange={(event) => setCompareWith(event.target.value as "original" | "previous")}><option value="original">Original</option><option value="previous">Previous version</option></select></label>
              <div className="grid grid-cols-[1fr_auto] gap-2"><Button variant="quiet" onClick={() => currentVersion && exportVersion(currentVersion, exportFormat)}><Download className="size-3.5" />Export current image</Button><select aria-label="Export format" className="border border-line bg-paper px-2 text-xs" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as "image/png" | "image/jpeg")}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option></select></div>
            </ControlSection>
          </fieldset>

          {state.error && <p className="border-l-4 border-accent bg-[#ffd5cc] p-3 text-xs leading-relaxed text-[#8f1d10]" role="alert">{state.error}</p>}
        </aside>

        <section className="order-1 grid min-h-0 min-w-0 grid-rows-[36px_minmax(0,1fr)_26px] bg-[#cfcdc5] p-2 pb-0 md:order-2 md:p-3 md:pb-0" aria-label="Image canvas">
          <div className="flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[.12em] text-[#4f4d47]">
            <span>{currentVersion ? `${currentVersion.width} × ${currentVersion.height}px` : "Canvas"}</span>
            <span>{state.operations.length} accepted edit{state.operations.length === 1 ? "" : "s"}</span>
          </div>
          <div className="relative min-h-0 overflow-hidden border border-[#343430] bg-[#151513] shadow-[0_1px_0_rgba(255,255,255,.35)]">
            {state.preview && comparisonVersion && currentVersion ? (
              <PreviewComparison
                baseLabel={compareWith === "previous" ? "Previous" : "Original"}
                originalUrl={comparisonVersion.dataUrl}
                previewUrl={state.preview.dataUrl}
                boundaryPolicy={state.preview.method === "generative" ? state.preview.parameters.boundaryPolicy : null}
                candidateAnalysis={state.preview.method === "generative" ? state.preview.parameters.candidateAnalysis : null}
                onAccept={state.acceptPreview}
                onDiscard={state.discardPreview}
              />
            ) : currentVersion && state.selectionMask ? <EditorCanvas version={currentVersion} mask={state.selectionMask} color={state.color} viewResetKey={state.viewResetKey} onPreview={handleSelectionPreview} /> : (
              <label className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 text-[#d4d1c8]">
                <span className="mb-2 grid size-14 place-items-center rounded-full border border-[#77746c] text-3xl transition group-hover:rotate-90 group-hover:bg-acid group-hover:text-ink">+</span>
                <strong className="text-sm">Open an image</strong>
                <span className="text-xs text-[#8e8b82]">PNG or JPEG</span>
                <input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={handleUpload} />
              </label>
            )}
          </div>
          <p className="flex items-center px-1 font-mono text-[8px] uppercase tracking-[.1em] text-[#5f5d56]">Lasso to select · Brush to refine · Scroll to zoom · Pan to move</p>
        </section>
      </section>
    </main>
    <DiagnosticsDrawer projectId={state.projectId} focusRequestId={state.lastRequestId} open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
    </>
  );
}

function IdChip({ label, value }: { label: string; value: string }) {
  const compact = `${value.slice(0, 8)}…`;
  return (
    <button className="group hidden min-w-0 items-center gap-1 border border-line bg-[#e8e5dc] px-2 py-1.5 hover:border-ink sm:flex" title={`Copy ${label.toLowerCase()} ID: ${value}`} onClick={() => void navigator.clipboard.writeText(value)}>
      <span className="text-[7px] text-muted">{label}</span><code className="text-[9px] text-ink">{compact}</code><Copy className="size-3 opacity-45 group-hover:opacity-100" />
    </button>
  );
}

/** Shows the immutable original and unaccepted candidate before history advances. */
function PreviewComparison({ baseLabel, originalUrl, previewUrl, boundaryPolicy, candidateAnalysis, onAccept, onDiscard }: {
  baseLabel: string;
  originalUrl: string;
  previewUrl: string;
  boundaryPolicy: EditBoundaryPolicy | null;
  candidateAnalysis: CandidateAnalysis | null;
  onAccept: () => boolean;
  onDiscard: () => void;
}) {
  return (
    <div className="absolute inset-0 grid grid-rows-[auto_1fr_auto] bg-[#151513] p-3" data-testid="preview-comparison">
      {boundaryPolicy && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-white/20 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-white">
          <span>{boundaryPolicy === "review" ? "Complete AI proposal" : "Protected-mask composite"}</span>
          {candidateAnalysis && <span className={candidateAnalysis.changedOutsideSelectionPixels > 0 ? "text-[#ffb5a7]" : "text-acid"}>{candidateAnalysis.changedOutsideSelectionPixels > 0 ? `${Math.round(candidateAnalysis.changedOutsideSelectionRatio * 1000) / 10}% outside-focus pixels changed` : "Changes stayed inside focus"}</span>}
        </div>
      )}
      <div className="grid min-h-0 grid-cols-2 gap-3">
        <figure className="grid min-h-0 grid-rows-[auto_1fr] border border-white/20">
          <figcaption className="border-b border-white/20 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white">{baseLabel}</figcaption>
          <div className="relative min-h-0"><Image src={originalUrl} alt="Original image" fill unoptimized className="object-contain" /></div>
        </figure>
        <figure className="grid min-h-0 grid-rows-[auto_1fr] border border-acid">
          <figcaption className="border-b border-acid px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-acid">Preview</figcaption>
          <div className="relative min-h-0"><Image src={previewUrl} alt="Recolor preview" fill unoptimized className="object-contain" /></div>
        </figure>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" className="border-white text-white hover:shadow-[3px_3px_0_white]" onClick={onDiscard}><X className="size-4" />Discard</Button>
        <Button data-testid="accept-preview" variant="accent" onClick={onAccept}><Check className="size-4" />Accept edit</Button>
      </div>
    </div>
  );
}

/** Keeps each numbered editor step visually and semantically consistent. */
function ControlSection({ number, title, subtitle, className, children }: { number: string; title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("grid grid-cols-[24px_1fr] gap-x-2 gap-y-3 border-b border-line py-4", className)}>
      <span className="pt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted">{number}</span>
      <div><h2 className="text-base font-bold tracking-tight">{title}</h2><p className="mt-0.5 text-[11px] leading-snug text-muted">{subtitle}</p></div>
      <div className="col-span-2 grid gap-3">{children}</div>
    </section>
  );
}
