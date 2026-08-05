"use client";

import { Activity, Film, LoaderCircle, Sparkles, WandSparkles, X } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { transformPresets, type TransformPresetId, type TransformPreservationMode } from "@/shared/transform-presets";
import { useEditorStore } from "../store";
import type { TransformInput } from "../types";
import type { ProviderCapabilities } from "./workspace-types";

const preservationModes: Array<{ value: TransformPreservationMode; label: string; description: string }> = [
  { value: "faithful", label: "Faithful", description: "Hold identity and layout closely" },
  { value: "balanced", label: "Balanced", description: "Style with measured adaptation" },
  { value: "imaginative", label: "Imaginative", description: "Allow broader reinterpretation" },
];

export function TransformDialog({
  open,
  providerCapabilities,
  realRequestsUsed,
  onClose,
  onGenerate,
  onRetry,
  onOpenDiagnostics,
}: {
  open: boolean;
  providerCapabilities: ProviderCapabilities | null;
  realRequestsUsed: number;
  onClose: () => void;
  onGenerate: (input: TransformInput) => Promise<boolean>;
  onRetry: () => Promise<boolean>;
  onOpenDiagnostics: () => void;
}) {
  const [presetId, setPresetId] = useState<TransformPresetId | null>("anime");
  const [userPrompt, setUserPrompt] = useState("");
  const [preservationMode, setPreservationMode] = useState<TransformPreservationMode>("faithful");
  const state = useEditorStore(useShallow((editor) => ({
    paintSession: editor.paintSession,
    generativeState: editor.generativeState,
    fakeScenario: editor.fakeScenario,
    setFakeScenario: editor.setFakeScenario,
  })));
  if (!open) return null;

  const processing = state.generativeState.status === "processing" && state.generativeState.snapshot.operation === "transform";
  const failed = state.generativeState.status === "failed" && state.generativeState.snapshot.operation === "transform";
  const requestLimitReached = providerCapabilities?.provider === "openai" && realRequestsUsed >= providerCapabilities.maxRealRequestsPerSession;
  const localMonochrome = presetId === "monochrome" && userPrompt.trim().length === 0;
  const ready = Boolean(presetId || userPrompt.trim()) && !state.paintSession && !processing && (!requestLimitReached || localMonochrome);

  async function generate() {
    const preset = presetId ? transformPresets.find((item) => item.id === presetId)! : null;
    const succeeded = await onGenerate({
      presetId,
      presetVersion: preset?.version ?? null,
      userPrompt,
      preservationMode,
    });
    if (succeeded) onClose();
  }

  async function retry() {
    if (await onRetry()) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#11110f]/75 p-3 backdrop-blur-[4px] sm:p-6" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !processing && onClose()}>
      <section className="transform-dialog-enter grid max-h-[min(860px,94dvh)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-paper shadow-[10px_10px_0_rgba(216,244,65,.42)] ring-1 ring-white/20" role="dialog" aria-modal="true" aria-labelledby="transform-title">
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center bg-ink text-acid"><WandSparkles className="size-4" /></span>
            <div>
              <span className="font-mono text-[8px] uppercase tracking-[.16em] text-muted">Complete image</span>
              <h2 id="transform-title" className="text-xl font-bold tracking-[-.04em] sm:text-2xl">Transform the visual language</h2>
              <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted">Choose a treatment, then refine the direction. Mirai preserves one complete proposal for comparison before history changes.</p>
            </div>
          </div>
          <button type="button" aria-label="Close Transform" className="grid size-9 shrink-0 place-items-center text-muted hover:bg-[#e8e5dc] hover:text-ink disabled:opacity-30" disabled={processing} onClick={onClose}><X className="size-4" /></button>
        </header>

        <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)]">
          <div className="border-b border-line p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">01 / Direction</span><h3 className="mt-0.5 text-sm font-bold">Treatment contact sheet</h3></div>
              <span className="font-mono text-[8px] uppercase text-muted">5 recipes + custom</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Transformation preset">
              {transformPresets.map((preset, index) => (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={presetId === preset.id}
                  className={cn("group relative grid min-h-32 overflow-hidden border border-line bg-[#dedbd2] text-left outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent", presetId === preset.id && "border-ink ring-2 ring-ink")}
                  onClick={() => setPresetId(preset.id)}
                >
                  <PresetArtwork presetId={preset.id} colors={preset.swatch} index={index} />
                  <span className={cn("relative mt-auto grid gap-0.5 border-t px-3 py-2.5", presetId === preset.id ? "border-ink bg-ink text-paper" : "border-line bg-paper/95 text-ink")}>
                    <strong className="text-xs">{preset.label}</strong>
                    <span className={cn("text-[9px]", presetId === preset.id ? "text-paper/60" : "text-muted")}>{preset.description}</span>
                  </span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={presetId === null} className={cn("group grid min-h-32 content-between border border-dashed border-muted/60 bg-paper p-3 text-left outline-none hover:border-ink hover:bg-[#e8e5dc] focus-visible:ring-2 focus-visible:ring-accent", presetId === null && "border-solid border-ink bg-ink text-paper ring-2 ring-ink")} onClick={() => setPresetId(null)}>
                <Sparkles className="size-5" />
                <span className="grid gap-1"><strong className="text-xs">Custom direction</strong><span className={cn("text-[9px]", presetId === null ? "text-paper/60" : "text-muted")}>Build the treatment entirely from your prompt</span></span>
              </button>
            </div>
          </div>

          <div className="grid content-start gap-5 p-4 sm:p-6">
            <section className="grid gap-2">
              <span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">02 / Refine</span>
              <label className="grid gap-1.5 text-[10px] font-medium text-muted">
                Creative direction <span className="font-normal">(optional with a preset)</span>
                <textarea autoFocus={presetId === null} aria-label="Transformation prompt" className="min-h-28 resize-y bg-[#e8e5dc] p-3 text-xs leading-relaxed text-ink outline-none placeholder:text-muted/55 focus:ring-2 focus:ring-accent" value={userPrompt} placeholder={presetId === "anime" ? "Warm evening light with a nostalgic summer atmosphere…" : "Describe mood, lighting, texture, or era…"} onChange={(event) => setUserPrompt(event.target.value)} />
              </label>
            </section>

            <section className="grid gap-2">
              <span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">03 / Preservation</span>
              <div className="grid gap-px bg-line" role="radiogroup" aria-label="Preservation level">
                {preservationModes.map((mode) => (
                  <button key={mode.value} type="button" role="radio" aria-checked={preservationMode === mode.value} className={cn("grid grid-cols-[auto_1fr] items-center gap-x-2 bg-paper px-3 py-2 text-left hover:bg-white", preservationMode === mode.value && "bg-[#edf5c4]")} onClick={() => setPreservationMode(mode.value)}>
                    <span className={cn("size-2 rounded-full border border-ink", preservationMode === mode.value && "bg-ink ring-2 ring-acid")} />
                    <span><strong className="block text-[10px]">{mode.label}</strong><span className="text-[9px] text-muted">{mode.description}</span></span>
                  </button>
                ))}
              </div>
            </section>

            {providerCapabilities?.fakeScenarios && (
              <label className="grid gap-1 font-mono text-[8px] uppercase tracking-[.1em] text-muted">Development scenario<select className="h-9 bg-[#e8e5dc] px-2 text-xs normal-case text-ink" value={state.fakeScenario} onChange={(event) => state.setFakeScenario(event.target.value as typeof state.fakeScenario)}><option value="success">Success</option><option value="slow">Slow success</option><option value="retryable-error">Retryable failure</option><option value="fatal-error">Permanent failure</option></select></label>
            )}

            {state.paintSession && <p className="border-l-2 border-accent bg-[#ffd5cc] p-3 text-[10px] text-[#8f1d10]">Apply or discard the pending paint before transforming the image.</p>}
            {failed && <div className="grid gap-2 border-l-2 border-accent bg-[#ffd5cc] p-3 text-[10px] text-[#8f1d10]" role="alert"><span>{state.generativeState.error}</span><div className="flex gap-2"><button type="button" className="h-8 bg-paper px-2 font-bold text-ink" onClick={onOpenDiagnostics}><Activity className="mr-1 inline size-3" />Diagnostics</button>{state.generativeState.retryable && <button type="button" className="h-8 bg-paper px-2 font-bold text-ink" onClick={() => void retry()}>Retry same request</button>}</div></div>}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#e8e5dc] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.1em] text-muted">
            {localMonochrome ? <><Film className="size-3.5" /><span>Instant local conversion · no model call</span></> : <><Sparkles className="size-3.5" /><span>{providerCapabilities?.provider === "openai" ? `Plan + image + validation · ${realRequestsUsed}/${providerCapabilities.maxRealRequestsPerSession} image requests used` : "Deterministic fake pipeline"}</span></>}
          </div>
          <div className="flex gap-2"><button type="button" className="h-10 px-3 text-xs font-bold text-muted hover:bg-white/60 hover:text-ink" disabled={processing} onClick={onClose}>Cancel</button><button type="button" data-testid="generate-transform" className="flex h-10 min-w-40 items-center justify-center gap-2 bg-ink px-4 text-xs font-bold text-paper hover:bg-acid hover:text-ink disabled:pointer-events-none disabled:opacity-35" disabled={!ready} onClick={() => void generate()}>{processing ? <><LoaderCircle className="size-4 animate-spin" />Transforming…</> : <><WandSparkles className="size-4" />Generate preview</>}</button></div>
        </footer>
      </section>
    </div>
  );
}

function PresetArtwork({ presetId, colors, index }: { presetId: TransformPresetId; colors: readonly [string, string, string]; index: number }) {
  return (
    <span className="absolute inset-x-0 top-0 h-[76px] overflow-hidden" style={{ background: `linear-gradient(${118 + index * 17}deg, ${colors[0]} 0 38%, ${colors[1]} 38% 67%, ${colors[2]} 67%)` }} aria-hidden="true">
      <span className={cn("absolute left-[18%] top-[14%] h-[125%] w-[42%] rounded-[50%_45%_12%_18%] border-[3px] opacity-80", presetId === "sketch" ? "border-dashed" : "border-solid")} style={{ borderColor: colors[2], background: `${colors[0]}88`, transform: `rotate(${index * 7 - 11}deg)` }} />
      <span className="absolute -right-4 -top-5 size-20 rounded-full border-[8px] opacity-65" style={{ borderColor: colors[0] }} />
      {presetId === "old-cartoon" && <span className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(#24170f 1px, transparent 1px)", backgroundSize: "5px 5px" }} />}
      {presetId === "sketch" && <span className="absolute inset-0 opacity-30" style={{ backgroundImage: "repeating-linear-gradient(16deg, transparent 0 4px, #292722 5px 6px)" }} />}
      {presetId === "cinematic" && <span className="absolute inset-x-0 bottom-1 h-px bg-white/50 shadow-[0_7px_18px_5px_rgba(232,136,71,.55)]" />}
      {presetId === "anime" && <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-white shadow-[0_0_18px_6px_rgba(255,255,255,.75)]" />}
    </span>
  );
}
