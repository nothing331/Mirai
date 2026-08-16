"use client";

import { Type } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useEditorStore } from "../store";
import type { TextOverlayParameters } from "../types";
import { DirectEditFooter } from "./DirectEditFooter";

export function TextInspector() {
  const draft = useEditorStore((state) => state.localDraft?.type === "text" ? state.localDraft : null);
  const beginLocalDraft = useEditorStore((state) => state.beginLocalDraft);
  const updateLocalDraft = useEditorStore((state) => state.updateLocalDraft);
  const applyLocalDraft = useEditorStore((state) => state.applyLocalDraft);
  const discardLocalDraft = useEditorStore((state) => state.discardLocalDraft);

  if (!draft) {
    return <EmptyDirectInspector eyebrow="Direct edit" title="Text" description="Add editable text directly over the image." action="Add text" onStart={() => beginLocalDraft("text")} />;
  }
  const parameters = draft.parameters;
  const update = (next: Partial<TextOverlayParameters>) => updateLocalDraft({ ...draft, parameters: { ...parameters, ...next } });

  return (
    <div className="inspector-enter flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="sticky top-0 z-10 bg-paper py-3">
          <span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">Direct edit</span>
          <h2 className="mt-0.5 text-sm font-bold tracking-[-.02em]">Text</h2>
        </div>
        <section className="grid gap-4 border-t border-line py-4" aria-label="Text controls">
          <label className="grid gap-1.5 text-[10px] text-muted">Content
            <textarea autoFocus aria-label="Text content" className="min-h-24 resize-y bg-[#e8e5dc] p-2.5 text-xs leading-relaxed text-ink outline-none focus:ring-2 focus:ring-accent" value={parameters.content} onChange={(event) => update({ content: event.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Font" value={parameters.fontFamily} options={["Manrope", "Georgia", "DM Mono"]} onChange={(fontFamily) => update({ fontFamily: fontFamily as TextOverlayParameters["fontFamily"] })} />
            <SelectField label="Weight" value={String(parameters.fontWeight)} options={["400", "600", "700"]} onChange={(fontWeight) => update({ fontWeight: Number(fontWeight) as TextOverlayParameters["fontWeight"] })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Font size" value={parameters.fontSize} min={8} onChange={(fontSize) => update({ fontSize })} />
            <ColorField label="Text color" value={parameters.color} onChange={(color) => update({ color })} />
          </div>
          <RangeField label="Opacity" value={parameters.opacity} min={0.05} max={1} step={0.01} display={`${Math.round(parameters.opacity * 100)}%`} onChange={(opacity) => update({ opacity })} />
          <RangeField label="Rotation" value={parameters.rotation} min={-180} max={180} step={1} display={`${Math.round(parameters.rotation)}°`} onChange={(rotation) => update({ rotation })} />
          <label className="grid gap-1.5 text-[10px] text-muted">Alignment
            <select aria-label="Text alignment" className="h-9 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" value={parameters.align} onChange={(event) => update({ align: event.target.value as TextOverlayParameters["align"] })}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 bg-[#e8e5dc] px-3 text-[10px] text-ink"><input type="checkbox" checked={parameters.backgroundColor !== null} onChange={(event) => update({ backgroundColor: event.target.checked ? "#171714" : null })} />Background</label>
          {parameters.backgroundColor ? <ColorField label="Background color" value={parameters.backgroundColor} onChange={(backgroundColor) => update({ backgroundColor })} /> : null}
          <p className="border-l-2 border-acid bg-[#edf5c4] p-3 text-[10px] leading-relaxed text-ink">Typing updates the canvas immediately. Drag the text, use the handles to resize or rotate, and use arrow keys for precise movement.</p>
        </section>
      </div>
      <DirectEditFooter applyLabel="Apply text" disabled={parameters.content.trim().length === 0} onApply={applyLocalDraft} onDiscard={discardLocalDraft} />
    </div>
  );
}

export function EmptyDirectInspector({ eyebrow, title, description, action, onStart }: { eyebrow: string; title: string; description: string; action: string; onStart: () => void }) {
  return (
    <div className="inspector-enter grid h-full content-between gap-5 p-4">
      <div className="grid gap-3"><div><span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">{eyebrow}</span><h2 className="mt-0.5 text-sm font-bold tracking-[-.02em]">{title}</h2></div><p className="text-xs leading-relaxed text-muted">{description}</p></div>
      <button type="button" className="flex h-10 items-center justify-center gap-2 bg-acid text-xs font-bold text-ink hover:bg-ink hover:text-acid" onClick={onStart}><Type className="size-4" />{action}</button>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="grid gap-1 font-mono text-[8px] uppercase tracking-[.08em] text-muted">{label}<select aria-label={label} className="h-9 min-w-0 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1 font-mono text-[8px] uppercase tracking-[.08em] text-muted">{label}<input aria-label={label} className="h-9 min-w-0 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" type="number" min={min} max={40000} value={value} onChange={(event) => onChange(Math.max(min, Math.round(Number(event.target.value) || min)))} /></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 font-mono text-[8px] uppercase tracking-[.08em] text-muted">{label}<input aria-label={label} className="h-9 w-full cursor-pointer bg-[#e8e5dc] p-1" type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function RangeField({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-[10px] text-muted"><span>{label}</span><output className="font-mono text-[9px] text-ink">{display}</output><Slider className="col-span-2 py-1.5" min={min} max={max} step={step} value={[value]} onValueChange={([next]) => onChange(next)} aria-label={label} /></div>;
}
