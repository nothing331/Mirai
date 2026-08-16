"use client";

import { ImagePlus, Stamp } from "lucide-react";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { decodeOverlayImage } from "../image-data";
import { getCurrentVersion, useEditorStore } from "../store";
import type { WatermarkParameters } from "../types";
import { DirectEditFooter } from "./DirectEditFooter";
import { RangeField } from "./TextInspector";

const anchors: WatermarkParameters["anchor"][] = ["north-west", "north", "north-east", "west", "center", "east", "south-west", "south", "south-east"];

export function WatermarkInspector() {
  const version = useEditorStore(getCurrentVersion);
  const draft = useEditorStore((state) => state.localDraft?.type === "watermark" ? state.localDraft : null);
  const overlayAssets = useEditorStore((state) => state.overlayAssets);
  const beginLocalDraft = useEditorStore((state) => state.beginLocalDraft);
  const updateLocalDraft = useEditorStore((state) => state.updateLocalDraft);
  const addOverlayAsset = useEditorStore((state) => state.addOverlayAsset);
  const applyLocalDraft = useEditorStore((state) => state.applyLocalDraft);
  const discardLocalDraft = useEditorStore((state) => state.discardLocalDraft);
  const setError = useEditorStore((state) => state.setError);

  if (!version) return null;
  const currentVersion = version;
  if (!draft) {
    return (
      <div className="inspector-enter grid h-full content-between gap-5 p-4">
        <div className="grid gap-3"><div><span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">Direct edit</span><h2 className="mt-0.5 text-sm font-bold tracking-[-.02em]">Watermark</h2></div><p className="text-xs leading-relaxed text-muted">Place a movable text or PNG mark over the image.</p></div>
        <button type="button" className="flex h-10 items-center justify-center gap-2 bg-acid text-xs font-bold text-ink hover:bg-ink hover:text-acid" onClick={() => beginLocalDraft("watermark")}><Stamp className="size-4" />Add watermark</button>
      </div>
    );
  }

  const parameters = draft.parameters;
  const asset = overlayAssets.find((item) => item.id === parameters.overlayAssetId) ?? null;
  const update = (next: Partial<WatermarkParameters>) => updateLocalDraft({ ...draft, parameters: { ...parameters, ...next } });

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const nextAsset = await decodeOverlayImage(file);
      addOverlayAsset(nextAsset);
      update({ source: "image", overlayAssetId: nextAsset.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : "The watermark could not be opened.");
    }
  }

  function selectAnchor(anchor: WatermarkParameters["anchor"]) {
    if (anchor === "free") return;
    const width = Math.min(parameters.width, Math.max(24, currentVersion.width - parameters.margin * 2));
    const height = parameters.source === "image" && asset ? width * asset.height / asset.width : parameters.fontSize * 1.25;
    const column = anchor.includes("west") ? 0 : anchor.includes("east") ? 1 : 0.5;
    const row = anchor.includes("north") ? 0 : anchor.includes("south") ? 1 : 0.5;
    update({ anchor, width, x: parameters.margin + (currentVersion.width - parameters.margin * 2 - width) * column, y: parameters.margin + (currentVersion.height - parameters.margin * 2 - height) * row });
  }

  const applyDisabled = parameters.source === "text" ? parameters.content.trim().length === 0 : !asset;
  return (
    <div className="inspector-enter flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="sticky top-0 z-10 bg-paper py-3"><span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">Direct edit</span><h2 className="mt-0.5 text-sm font-bold tracking-[-.02em]">Watermark</h2></div>
        <section className="grid gap-4 border-t border-line py-4" aria-label="Watermark controls">
          <div className="grid grid-cols-2 bg-[#e8e5dc] p-0.5" role="radiogroup" aria-label="Watermark type">
            <button type="button" role="radio" aria-checked={parameters.source === "text"} className={cn("h-9 font-mono text-[8px] uppercase text-muted hover:bg-white/70", parameters.source === "text" && "bg-ink text-paper hover:bg-ink hover:text-acid")} onClick={() => update({ source: "text" })}>Text</button>
            <button type="button" role="radio" aria-checked={parameters.source === "image"} className={cn("h-9 font-mono text-[8px] uppercase text-muted hover:bg-white/70", parameters.source === "image" && "bg-ink text-paper hover:bg-ink hover:text-acid")} onClick={() => update({ source: "image" })}>Logo</button>
          </div>

          {parameters.source === "text" ? <>
            <label className="grid gap-1.5 text-[10px] text-muted">Watermark text<input aria-label="Watermark text" className="h-9 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" value={parameters.content} onChange={(event) => update({ content: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2"><NumberField label="Font size" value={parameters.fontSize} min={8} onChange={(fontSize) => update({ fontSize })} /><ColorField label="Color" value={parameters.color} onChange={(color) => update({ color })} /></div>
          </> : <label className="flex h-10 cursor-pointer items-center justify-center gap-2 bg-[#e8e5dc] text-xs font-bold text-ink hover:bg-white/70"><ImagePlus className="size-4" />{asset ? "Replace PNG logo" : "Upload PNG logo"}<input className="sr-only" type="file" accept="image/png" onChange={uploadLogo} /></label>}

          <div className="grid gap-1.5 text-[10px] text-muted"><span>Quick position</span><div className="grid grid-cols-3 border border-line bg-[#e8e5dc]">{anchors.map((anchor) => <button key={anchor} type="button" aria-label={`Watermark ${anchor}`} aria-pressed={parameters.anchor === anchor} className={cn("h-9 border-b border-r border-line text-xs text-muted outline-none hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0", parameters.anchor === anchor && "bg-ink text-acid")} onClick={() => selectAnchor(anchor)}>{anchorGlyph(anchor)}</button>)}</div></div>
          <RangeField label="Opacity" value={parameters.opacity} min={0.05} max={1} step={0.01} display={`${Math.round(parameters.opacity * 100)}%`} onChange={(opacity) => update({ opacity })} />
          <RangeField label="Relative size" value={Math.min(1, parameters.width / currentVersion.width)} min={0.05} max={1} step={0.01} display={`${Math.round(parameters.width / currentVersion.width * 100)}%`} onChange={(value) => update({ width: Math.max(24, currentVersion.width * value), anchor: "free" })} />
          <RangeField label="Rotation" value={parameters.rotation} min={-180} max={180} step={1} display={`${Math.round(parameters.rotation)}°`} onChange={(rotation) => update({ rotation })} />
          <NumberField label="Margin" value={parameters.margin} min={0} onChange={(margin) => update({ margin })} />
          <p className="border-l-2 border-acid bg-[#edf5c4] p-3 text-[10px] leading-relaxed text-ink">Presets place the mark quickly. Drag it anywhere on the image to switch to free positioning.</p>
        </section>
      </div>
      <DirectEditFooter applyLabel="Apply watermark" disabled={applyDisabled} onApply={applyLocalDraft} onDiscard={discardLocalDraft} />
    </div>
  );
}

function anchorGlyph(anchor: WatermarkParameters["anchor"]) {
  if (anchor === "center") return "●";
  if (anchor.includes("north")) return anchor.includes("west") ? "↖" : anchor.includes("east") ? "↗" : "↑";
  if (anchor.includes("south")) return anchor.includes("west") ? "↙" : anchor.includes("east") ? "↘" : "↓";
  return anchor === "west" ? "←" : "→";
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1 font-mono text-[8px] uppercase tracking-[.08em] text-muted">{label}<input aria-label={label} className="h-9 min-w-0 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" type="number" min={min} max={40000} value={Math.round(value)} onChange={(event) => onChange(Math.max(min, Math.round(Number(event.target.value) || min)))} /></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 font-mono text-[8px] uppercase tracking-[.08em] text-muted">{label}<input aria-label={label} className="h-9 w-full cursor-pointer bg-[#e8e5dc] p-1" type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
