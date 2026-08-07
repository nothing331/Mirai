"use client";

import { Activity, Brush, ChevronDown, Palette, Shield, Sparkles, WandSparkles } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { EditBoundaryPolicy } from "@/shared/edit-boundary";
import { useEditorStore } from "../store";
import type { EditType, FakeScenario, SelectionMode, TransformInput } from "../types";
import { TransformInspector } from "./TransformInspector";
import type { ProviderCapabilities } from "./workspace-types";
import type { WorkspacePhase } from "./workspace-phase";

const editModes: Array<{ value: EditType; label: string; accessibleLabel: string }> = [
  { value: "recolor", label: "Color", accessibleLabel: "Color mode" },
  { value: "remove", label: "Remove", accessibleLabel: "Remove" },
  { value: "replace", label: "Replace", accessibleLabel: "Add / replace" },
  { value: "restyle", label: "Style", accessibleLabel: "Restyle" },
];

export function EditorInspector({
  phase,
  providerCapabilities,
  realRequestsUsed,
  transformSelected,
  onGenerate,
  onGenerateTransform,
  onRetry,
  onOpenDiagnostics,
}: {
  phase: WorkspacePhase;
  providerCapabilities: ProviderCapabilities | null;
  realRequestsUsed: number;
  transformSelected: boolean;
  onGenerate: () => void;
  onGenerateTransform: (input: TransformInput) => Promise<boolean>;
  onRetry: () => Promise<boolean>;
  onOpenDiagnostics: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const state = useEditorStore(useShallow((editor) => ({
    tool: editor.tool,
    brushSize: editor.brushSize,
    maskSoftness: editor.maskSoftness,
    editType: editor.editType,
    prompt: editor.prompt,
    color: editor.color,
    fakeScenario: editor.fakeScenario,
    boundaryPolicy: editor.boundaryPolicy,
    selectionDiagnostics: editor.selectionDiagnostics,
    selectionMode: editor.selectionMode,
    paintSession: editor.paintSession,
    generativeState: editor.generativeState,
    error: editor.error,
    setBrushSize: editor.setBrushSize,
    setMaskSoftness: editor.setMaskSoftness,
    setEditType: editor.setEditType,
    setPrompt: editor.setPrompt,
    setColor: editor.setColor,
    setFakeScenario: editor.setFakeScenario,
    setBoundaryPolicy: editor.setBoundaryPolicy,
    setSelectionMode: editor.setSelectionMode,
    commitPaintSession: editor.commitPaintSession,
    discardPaintSession: editor.discardPaintSession,
  })));
  const processing = phase === "processing";
  const requestLimitReached = providerCapabilities?.provider === "openai" && realRequestsUsed >= providerCapabilities.maxRealRequestsPerSession;

  if (phase === "empty") {
    return (
      <div className="grid h-full content-center justify-items-center gap-2 px-5 text-center text-muted">
        <WandSparkles className="size-5" />
        <strong className="text-xs text-ink">Open an image to begin</strong>
      </div>
    );
  }

  if (transformSelected) {
    return <TransformInspector providerCapabilities={providerCapabilities} realRequestsUsed={realRequestsUsed} onGenerate={onGenerateTransform} onRetry={onRetry} onOpenDiagnostics={onOpenDiagnostics} />;
  }

  if (phase === "preview") {
    return (
      <div className="inspector-enter grid h-full content-between gap-5 p-4">
        <div className="grid gap-3">
          <InspectorHeading eyebrow="Review" title="Compare the result" />
          <p className="text-xs leading-relaxed text-muted">Accept the proposal to add one immutable version, or discard it without changing history.</p>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Review controls are on the canvas</span>
      </div>
    );
  }

  if (state.tool === "pan") return null;

  if (state.tool === "brush" || state.tool === "eraser") {
    const isBrush = state.tool === "brush";
    return (
      <div className="inspector-enter flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="sticky top-0 z-10 bg-paper py-3">
            <InspectorHeading eyebrow={isBrush ? "Paint" : "Correct"} title={isBrush ? "Brush" : "Erase paint"} />
          </div>
          <section className="grid gap-4 border-t border-line py-4">
            {isBrush ? (
              <label className="flex h-11 items-center gap-3 bg-[#e8e5dc] px-1.5 font-mono text-[10px]">
                <input aria-label="Brush color" className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" type="color" value={state.color} onChange={(event) => state.setColor(event.target.value)} />
                <Palette className="size-3.5 text-muted" /><span>{state.color.toUpperCase()}</span>
              </label>
            ) : (
              <p className="border-l-2 border-acid bg-[#edf5c4] p-3 text-[10px] leading-relaxed text-ink">Eraser removes only paint that has not been applied. Your original image is never erased.</p>
            )}
            <CompactSlider label="Size" value={`${state.brushSize}px`} min={4} max={160} step={1} sliderValue={state.brushSize} onChange={state.setBrushSize} />
            <CompactSlider label="Softness" value={`${Math.round(state.maskSoftness * 100)}%`} min={0} max={0.8} step={0.05} sliderValue={state.maskSoftness} onChange={state.setMaskSoftness} />
          </section>
          <div className="border-t border-line py-3 font-mono text-[8px] uppercase tracking-[.12em] text-muted">
            {state.paintSession ? `${state.paintSession.strokeCount} pending gesture${state.paintSession.strokeCount === 1 ? "" : "s"}` : isBrush ? "Paint directly on the image" : "No pending paint yet"}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-line p-3">
          <button type="button" data-testid="apply-paint" className="flex h-10 items-center justify-center gap-2 bg-acid px-3 text-xs font-bold text-ink hover:bg-ink hover:text-acid disabled:pointer-events-none disabled:opacity-35" disabled={!state.paintSession} onClick={state.commitPaintSession}><Brush className="size-4" />Apply paint</button>
          <button type="button" data-testid="discard-paint" className="h-10 px-3 font-mono text-[9px] uppercase text-muted hover:bg-[#e8e5dc] hover:text-ink disabled:pointer-events-none disabled:opacity-35" disabled={!state.paintSession} onClick={state.discardPaintSession}>Discard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector-enter flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-paper py-3">
          <InspectorHeading eyebrow="Edit" title={phase === "selected" ? "Selection ready" : processing ? "Generating" : phase === "failed" ? "Request failed" : "Configure edit"} />
          <span className={cn("size-2 rounded-full", phase === "selected" ? "bg-acid ring-1 ring-ink" : processing ? "animate-pulse bg-acid" : phase === "failed" ? "bg-accent" : "bg-line")} aria-hidden="true" />
        </div>

        <section className="grid gap-3 border-t border-line py-3" aria-label="Lasso selection settings">
          <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Selection</span>
          <div className="grid grid-cols-3 bg-[#e8e5dc] p-0.5" role="radiogroup" aria-label="Selection mode">
            {([['draw', 'Draw'], ['add', 'Add'], ['subtract', 'Subtract']] as Array<[SelectionMode, string]>).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={state.selectionMode === value} className={cn("h-8 font-mono text-[8px] uppercase text-muted hover:bg-white/70 hover:text-ink", state.selectionMode === value && "bg-ink text-paper hover:bg-ink hover:text-acid")} onClick={() => state.setSelectionMode(value)}>{label}</button>
            ))}
          </div>
          {state.selectionMode !== "draw" && <>
            <CompactSlider label="Size" value={`${state.brushSize}px`} min={4} max={160} step={1} sliderValue={state.brushSize} onChange={state.setBrushSize} />
            <CompactSlider label="Softness" value={`${Math.round(state.maskSoftness * 100)}%`} min={0} max={0.8} step={0.05} sliderValue={state.maskSoftness} onChange={state.setMaskSoftness} />
          </>}
        </section>

        {state.paintSession && (
          <div className="grid gap-2 border-l-2 border-acid bg-[#edf5c4] p-3 text-[10px] leading-relaxed text-ink">
            <span>Paint is still pending. Apply or discard it before running a selection edit.</span>
            <div className="flex gap-2"><button type="button" className="h-8 bg-ink px-2 font-bold text-paper" onClick={state.commitPaintSession}>Apply paint</button><button type="button" className="h-8 px-2 font-bold hover:bg-white/60" onClick={state.discardPaintSession}>Discard</button></div>
          </div>
        )}

        <section className="grid gap-3 border-t border-line py-3">
          <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Operation</span>
          <div className="grid grid-cols-4 bg-[#e8e5dc] p-0.5" role="radiogroup" aria-label="Edit operation">
            {editModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={state.editType === mode.value}
                aria-label={mode.accessibleLabel}
                className={cn("h-9 px-1 font-mono text-[8px] uppercase tracking-[-.02em] text-muted outline-none hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent", state.editType === mode.value && "bg-ink text-paper hover:bg-ink hover:text-acid")}
                onClick={() => state.setEditType(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {state.editType === "recolor" ? (
            <label className="flex h-11 items-center gap-3 bg-[#e8e5dc] px-1.5 font-mono text-[10px]">
              <input aria-label="Recolor" className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" type="color" value={state.color} onChange={(event) => state.setColor(event.target.value)} />
              <Palette className="size-3.5 text-muted" /><span>{state.color.toUpperCase()}</span>
            </label>
          ) : (
            <label className="grid gap-1.5 text-[10px] font-medium text-muted">
              <span>{state.editType === "replace" ? "Describe the replacement" : state.editType === "restyle" ? "Describe the new style" : "Removal context (optional)"}</span>
              <textarea
                aria-label="Edit instruction"
                className="min-h-24 resize-y bg-[#e8e5dc] p-2.5 text-xs leading-relaxed text-ink outline-none placeholder:text-muted/55 focus:ring-2 focus:ring-accent"
                value={state.prompt}
                placeholder={state.editType === "replace" ? "Add an object that belongs in the scene…" : state.editType === "restyle" ? "Change the material or visual style…" : "Describe what should continue behind it…"}
                onChange={(event) => state.setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    onGenerate();
                  }
                }}
              />
            </label>
          )}
        </section>

        {state.selectionDiagnostics?.warnings.length ? (
          <details className="border-t border-line py-3">
            <summary className="cursor-pointer list-none font-mono text-[8px] uppercase tracking-[.1em] text-[#795000] [&::-webkit-details-marker]:hidden">Selection warning · details</summary>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">The original contour was preserved where automatic cleanup was uncertain. Use Add or Subtract inside Lasso to refine it.</p>
          </details>
        ) : null}

        {state.editType !== "recolor" && (
          <details className="border-t border-line py-3" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[8px] uppercase tracking-[.12em] text-muted hover:text-ink [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Shield className="size-3.5" />Advanced</span><ChevronDown className={cn("size-3.5 transition-transform", advancedOpen && "rotate-180")} /></summary>
            <div className="grid gap-3 pt-3">
              <label className="grid gap-1.5 text-[10px] text-muted">
                AI edit behavior
                <select aria-label="AI edit behavior" className="h-9 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" value={state.boundaryPolicy} onChange={(event) => state.setBoundaryPolicy(event.target.value as EditBoundaryPolicy)}>
                  <option value="review">Let AI blend naturally</option>
                  <option value="protected">Protect outside selection</option>
                </select>
              </label>
              {providerCapabilities?.fakeScenarios && (
                <label className="grid gap-1.5 text-[10px] text-muted">
                  Fake provider scenario
                  <select aria-label="Fake provider scenario" className="h-9 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" value={state.fakeScenario} onChange={(event) => state.setFakeScenario(event.target.value as FakeScenario)}>
                    <option value="success">Success</option>
                    <option value="slow">Slow success</option>
                    <option value="retryable-error">Retryable failure</option>
                    <option value="fatal-error">Permanent failure</option>
                  </select>
                </label>
              )}
              {providerCapabilities?.provider === "openai" && (
                <div className="grid gap-1 bg-[#fff0c7] p-2.5 text-[10px] text-[#6f4300]" role="status">
                  <strong>OpenAI · {realRequestsUsed}/{providerCapabilities.maxRealRequestsPerSession} requests</strong>
                  <span>{providerCapabilities.quality} quality · max {providerCapabilities.maxInputEdge}px</span>
                </div>
              )}
            </div>
          </details>
        )}

        {state.generativeState.status === "failed" && (
          <div className="grid gap-2 border-l-2 border-accent bg-[#ffd5cc] p-3 text-[10px] text-[#8f1d10]" role="alert">
            <span>{state.generativeState.error}</span>
            <code className="break-all font-mono text-[8px]">Request {state.generativeState.snapshot.requestId}</code>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="h-8 bg-paper px-2 font-bold text-ink hover:bg-white" onClick={onOpenDiagnostics}><Activity className="mr-1 inline size-3" />View diagnostics</button>
              {state.generativeState.retryable && <button type="button" className="h-8 bg-paper px-2 font-bold text-ink hover:bg-white" onClick={() => void onRetry()}>Retry same request</button>}
            </div>
          </div>
        )}

        {state.error && state.error !== state.generativeState.error && <p className="mt-3 border-l-2 border-accent bg-[#ffd5cc] p-3 text-[10px] leading-relaxed text-[#8f1d10]" role="alert">{state.error}</p>}
      </div>

      <div className="border-t border-line p-3">
        {state.editType === "recolor" ? (
          <button type="button" data-testid="apply-edit" className="flex h-10 w-full items-center justify-center gap-2 bg-acid text-xs font-bold text-ink outline-none hover:bg-ink hover:text-acid focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-45" disabled={Boolean(state.paintSession)} onClick={onGenerate}><Sparkles className="size-4" />Preview color</button>
        ) : (
          <button type="button" data-testid="generate-edit" className="flex h-10 w-full items-center justify-center gap-2 bg-acid text-xs font-bold text-ink outline-none hover:bg-ink hover:text-acid focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-45" disabled={processing || requestLimitReached || Boolean(state.paintSession)} onClick={onGenerate}>
            {processing ? <><Sparkles className="size-4 animate-pulse" />Processing…</> : <><WandSparkles className="size-4" />Generate preview</>}
          </button>
        )}
      </div>
    </div>
  );
}

function InspectorHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">{eyebrow}</span><h2 className="mt-0.5 text-sm font-bold tracking-[-.02em]">{title}</h2></div>;
}

function CompactSlider({ label, value, min, max, step, sliderValue, onChange }: { label: string; value: string; min: number; max: number; step: number; sliderValue: number; onChange: (value: number) => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-[10px] text-muted">
      <span>{label}</span><output className="font-mono text-[9px] text-ink">{value}</output>
      <Slider className="col-span-2 py-1.5" min={min} max={max} step={step} value={[sliderValue]} onValueChange={([next]) => onChange(next)} aria-label={label} />
    </div>
  );
}
