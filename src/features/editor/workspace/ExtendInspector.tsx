"use client";

import { Expand, LoaderCircle, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { extendPresets, type ExtendPresetId } from "@/shared/extend-presets";
import type { ExtendInput } from "../types";
import { useEditorStore } from "../store";

export function ExtendInspector({ onPlan, onGenerate, requestLimitReached }: { onPlan: (input: ExtendInput) => Promise<boolean>; onGenerate: () => Promise<boolean>; requestLimitReached: boolean }) {
  const extendState = useEditorStore(useShallow((state) => state.extendState));
  const [presetId, setPresetId] = useState<ExtendPresetId>(extendState.input?.presetId ?? "instagram-classic");
  const [strategy, setStrategy] = useState<ExtendInput["strategy"]>(extendState.input?.strategy ?? "smart");
  const [userPrompt, setUserPrompt] = useState(extendState.input?.userPrompt ?? "");
  const selected = extendPresets.find((preset) => preset.id === presetId)!;
  const busy = extendState.status === "analyzing" || extendState.status === "generating";
  const planned = extendState.status === "planned" && extendState.input.presetId === presetId && extendState.input.strategy === strategy && extendState.input.userPrompt === userPrompt.trim();

  const input: ExtendInput = { presetId, presetVersion: 1, strategy, userPrompt };
  return (
    <div className="inspector-enter flex h-full min-h-0 flex-col" data-testid="extend-inspector">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="sticky top-0 z-10 bg-paper py-3">
          <span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">Reframe</span>
          <h2 className="mt-1 text-base font-bold text-ink">Extend image</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">Fit the image to a useful format. Smart Reframe protects important content before generating new edges.</p>
        </div>

        <section className="grid gap-3 border-t border-line py-4">
          <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Target format</span>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Extend format">
            {extendPresets.map((preset) => (
              <button key={preset.id} type="button" role="radio" aria-checked={presetId === preset.id} className={cn("group grid min-h-16 content-between border border-line bg-[#e8e5dc] p-2 text-left outline-none hover:border-ink hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-accent", presetId === preset.id && "border-ink bg-ink text-paper")} onClick={() => setPresetId(preset.id)}>
                <strong className="text-[10px]">{preset.label}</strong>
                <span className={cn("font-mono text-[8px] uppercase text-muted", presetId === preset.id && "text-acid")}>{preset.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-3 border-t border-line py-4">
          <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Framing</span>
          <div className="grid grid-cols-2 bg-[#e8e5dc] p-0.5" role="radiogroup" aria-label="Reframe strategy">
            <button type="button" role="radio" aria-checked={strategy === "smart"} className={cn("h-10 px-2 text-[9px] font-bold text-muted", strategy === "smart" && "bg-ink text-acid")} onClick={() => setStrategy("smart")}>Smart Reframe</button>
            <button type="button" role="radio" aria-checked={strategy === "preserve-all"} className={cn("h-10 px-2 text-[9px] font-bold text-muted", strategy === "preserve-all" && "bg-ink text-acid")} onClick={() => setStrategy("preserve-all")}>Keep full image</button>
          </div>
          <p className="flex gap-2 border-l-2 border-acid bg-[#edf5c4] p-2.5 text-[9px] leading-relaxed"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />{strategy === "smart" ? "Only low-value outer space may be trimmed. Subjects and important text remain protected." : "No source content will be cropped. The canvas only grows around it."}</p>
        </section>

        <label className="grid gap-1.5 border-t border-line py-4 text-[10px] font-medium text-muted">
          Direction for new space <span className="font-normal">(optional)</span>
          <textarea className="min-h-20 resize-y bg-[#e8e5dc] p-2.5 text-xs leading-relaxed text-ink outline-none placeholder:text-muted/55 focus:ring-2 focus:ring-accent" value={userPrompt} placeholder="Continue the forest with subtle morning fog…" onChange={(event) => setUserPrompt(event.target.value)} />
        </label>

        {planned && extendState.plan && (
          <section className="grid gap-2 border-t border-line py-4" data-testid="extend-plan-summary">
            <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Frame ready</span>
            <strong className="text-xs">{extendState.plan.outputWidth} × {extendState.plan.outputHeight}px</strong>
            <div className="grid grid-cols-2 gap-2 font-mono text-[8px] uppercase text-muted"><span>{Math.round(extendState.plan.cropAreaRatio * 100)}% cropped</span><span>{Math.round(extendState.plan.generatedAreaRatio * 100)}% generated</span></div>
            <p className="text-[9px] leading-relaxed text-muted">{extendState.plan.rationale[0]}</p>
            {extendState.plan.warnings.map((warning) => <p key={warning} className="bg-[#fff0c7] p-2 text-[9px] text-[#6f4300]">{warning}</p>)}
          </section>
        )}
        {extendState.status === "failed" && <p className="border-l-2 border-accent bg-[#ffd5cc] p-3 text-[10px] text-[#8f1d10]" role="alert">{extendState.error}</p>}
      </div>

      <div className="grid gap-2 border-t border-line p-3">
        {!planned ? (
          <button type="button" className="flex h-10 items-center justify-center gap-2 bg-ink px-3 text-xs font-bold text-paper hover:text-acid disabled:opacity-40" disabled={busy} onClick={() => void onPlan({ ...input, userPrompt: userPrompt.trim() })}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}Preview smart frame</button>
        ) : (
          <button type="button" className="flex h-10 items-center justify-center gap-2 bg-acid px-3 text-xs font-bold text-ink hover:bg-ink hover:text-acid disabled:opacity-40" disabled={busy || requestLimitReached} onClick={() => void onGenerate()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Generate extension</button>
        )}
        <span className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[.1em] text-muted"><Expand className="size-3" />{selected.ratio[0]}:{selected.ratio[1]} · GPT Image 2 low</span>
      </div>
    </div>
  );
}
