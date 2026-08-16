"use client";

import { Activity, Film, LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
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

export function TransformInspector({
  providerCapabilities,
  realRequestsUsed,
  onGenerate,
  onRetry,
  onOpenDiagnostics,
}: {
  providerCapabilities: ProviderCapabilities | null;
  realRequestsUsed: number;
  onGenerate: (input: TransformInput) => Promise<boolean>;
  onRetry: () => Promise<boolean>;
  onOpenDiagnostics: () => void;
}) {
  const [presetId, setPresetId] = useState<TransformPresetId | null>("anime");
  const [userPrompt, setUserPrompt] = useState("");
  const [preservationMode, setPreservationMode] = useState<TransformPreservationMode>("faithful");
  const state = useEditorStore(useShallow((editor) => ({
    paintSession: editor.paintSession,
    preview: editor.preview,
    generativeState: editor.generativeState,
    fakeScenario: editor.fakeScenario,
    setFakeScenario: editor.setFakeScenario,
  })));
  const processing = state.generativeState.status === "processing" && state.generativeState.snapshot.operation === "transform";
  const failed = state.generativeState.status === "failed" && state.generativeState.snapshot.operation === "transform";
  const requestLimitReached = providerCapabilities?.provider === "openai" && realRequestsUsed >= providerCapabilities.maxRealRequestsPerSession;
  const localMonochrome = presetId === "monochrome" && userPrompt.trim().length === 0;
  const ready = Boolean(presetId || userPrompt.trim()) && !state.paintSession && !state.preview && !processing && (!requestLimitReached || localMonochrome);

  async function generate() {
    const preset = presetId ? transformPresets.find((item) => item.id === presetId)! : null;
    await onGenerate({ presetId, presetVersion: preset?.version ?? null, userPrompt, preservationMode });
  }

  return (
    <div className="inspector-enter flex h-full min-h-0 flex-col" data-testid="transform-inspector">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="sticky top-0 z-10 bg-paper py-3">
          <span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">Complete image</span>
          <h2 className="mt-0.5 text-sm font-bold tracking-[-.02em]">Transform</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">Choose a visual treatment for the whole image. You will review the proposal before history changes.</p>
        </div>

        <section className="grid gap-2 border-t border-line py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Treatment</span>
            <span className="font-mono text-[7px] uppercase text-muted">5 presets + custom</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Transformation preset">
            {transformPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={presetId === preset.id}
                className={cn(
                  "group overflow-hidden border border-line bg-[#e8e5dc] text-left outline-none hover:border-ink focus-visible:ring-2 focus-visible:ring-accent",
                  presetId === preset.id && "border-ink bg-ink text-paper ring-1 ring-ink",
                )}
                onClick={() => setPresetId(preset.id)}
              >
                <span className="block h-3" style={{ background: `linear-gradient(110deg, ${preset.swatch[0]} 0 36%, ${preset.swatch[1]} 36% 68%, ${preset.swatch[2]} 68%)` }} aria-hidden="true" />
                <span className="block px-2 py-2 text-[9px] font-bold leading-tight">{preset.label}</span>
              </button>
            ))}
            <button type="button" role="radio" aria-checked={presetId === null} className={cn("flex min-h-12 items-center gap-2 border border-dashed border-muted/60 px-2 text-left text-[9px] font-bold outline-none hover:border-ink focus-visible:ring-2 focus-visible:ring-accent", presetId === null && "border-solid border-ink bg-ink text-paper ring-1 ring-ink")} onClick={() => setPresetId(null)}>
              <Sparkles className="size-3.5 shrink-0" />Custom
            </button>
          </div>
        </section>

        <section className="grid gap-2 border-t border-line py-3">
          <label className="grid gap-1.5 text-[10px] font-medium text-muted">
            Creative direction <span className="font-normal">Optional with a preset</span>
            <textarea
              aria-label="Transformation prompt"
              className="min-h-24 resize-y bg-[#e8e5dc] p-2.5 text-xs leading-relaxed text-ink outline-none placeholder:text-muted/55 focus:ring-2 focus:ring-accent"
              value={userPrompt}
              placeholder={presetId === "anime" ? "Warm evening light with a nostalgic summer atmosphere…" : "Describe mood, lighting, texture, or era…"}
              onChange={(event) => setUserPrompt(event.target.value)}
            />
          </label>
        </section>

        <section className="grid gap-2 border-t border-line py-3">
          <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Preservation</span>
          <div className="grid gap-px bg-line" role="radiogroup" aria-label="Preservation level">
            {preservationModes.map((mode) => (
              <button key={mode.value} type="button" role="radio" aria-checked={preservationMode === mode.value} className={cn("grid grid-cols-[auto_1fr] items-center gap-x-2 bg-paper px-2.5 py-2 text-left hover:bg-white", preservationMode === mode.value && "bg-[#edf5c4]")} onClick={() => setPreservationMode(mode.value)}>
                <span className={cn("size-2 rounded-full border border-ink", preservationMode === mode.value && "bg-ink ring-2 ring-acid")} />
                <span><strong className="block text-[9px]">{mode.label}</strong><span className="text-[8px] text-muted">{mode.description}</span></span>
              </button>
            ))}
          </div>
        </section>

        {providerCapabilities?.fakeScenarios && (
          <label className="grid gap-1 border-t border-line py-3 font-mono text-[8px] uppercase tracking-[.1em] text-muted">Development scenario<select className="h-9 bg-[#e8e5dc] px-2 text-xs normal-case text-ink" value={state.fakeScenario} onChange={(event) => state.setFakeScenario(event.target.value as typeof state.fakeScenario)}><option value="success">Success</option><option value="slow">Slow success</option><option value="retryable-error">Retryable failure</option><option value="fatal-error">Permanent failure</option></select></label>
        )}

        {state.paintSession && <p className="border-l-2 border-accent bg-[#ffd5cc] p-3 text-[10px] text-[#8f1d10]">Apply or discard the pending paint before transforming the image.</p>}
        {failed && <div className="grid gap-2 border-l-2 border-accent bg-[#ffd5cc] p-3 text-[10px] text-[#8f1d10]" role="alert"><span>{state.generativeState.error}</span><div className="flex flex-wrap gap-2"><button type="button" className="h-8 bg-paper px-2 font-bold text-ink" onClick={onOpenDiagnostics}><Activity className="mr-1 inline size-3" />Diagnostics</button>{state.generativeState.retryable && <button type="button" className="h-8 bg-paper px-2 font-bold text-ink" onClick={() => void onRetry()}>Retry same request</button>}</div></div>}
      </div>

      <div className="border-t border-line bg-[#e8e5dc] p-3">
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[7px] uppercase leading-relaxed text-muted">
          {localMonochrome ? <><Film className="size-3 shrink-0" />No model call</> : <><Sparkles className="size-3 shrink-0" />{providerCapabilities?.provider === "openai" ? `${realRequestsUsed}/${providerCapabilities.maxRealRequestsPerSession} image requests used` : "Deterministic fake pipeline"}</>}
        </div>
        <button type="button" data-testid="generate-transform" className="flex h-10 w-full items-center justify-center gap-2 bg-ink px-3 text-xs font-bold text-paper outline-none hover:bg-acid hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-35" disabled={!ready} onClick={() => void generate()}>{processing ? <><LoaderCircle className="size-4 animate-spin" />Transforming…</> : state.preview ? <><WandSparkles className="size-4" />Review on canvas</> : <><WandSparkles className="size-4" />Generate preview</>}</button>
      </div>
    </div>
  );
}
