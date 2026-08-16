"use client";

import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Scaling } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentVersion, useEditorStore } from "../store";
import type { CropRatio, GeometryEditType, ImageVersion, LocalEditDraft } from "../types";

const geometryTools: Array<{ value: GeometryEditType; label: string; icon: typeof Crop }> = [
  { value: "crop", label: "Crop", icon: Crop },
  { value: "resize", label: "Resize", icon: Scaling },
  { value: "rotate", label: "Rotate", icon: RotateCw },
  { value: "flip", label: "Flip", icon: FlipHorizontal2 },
];

const cropRatios: CropRatio[] = ["free", "original", "1:1", "4:5", "3:2", "16:9", "9:16"];

export function SizePositionInspector({ onSelectEdit }: { onSelectEdit: (editType: GeometryEditType) => void }) {
  const version = useEditorStore(getCurrentVersion);
  const draft = useEditorStore((state) => state.localDraft);
  const updateLocalDraft = useEditorStore((state) => state.updateLocalDraft);
  if (!version) return null;

  const geometryDraft = draft && ["crop", "resize", "rotate", "flip"].includes(draft.type) ? draft : null;
  const activeType = geometryDraft?.type ?? "crop";

  return (
    <div className="inspector-enter flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="sticky top-0 z-10 bg-paper py-3">
          <span className="font-mono text-[8px] uppercase tracking-[.14em] text-muted">Direct edit</span>
          <h2 className="mt-0.5 text-sm font-bold tracking-[-.02em]">Size & position</h2>
        </div>

        <section className="grid gap-3 border-t border-line py-3">
          <span className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Operation</span>
          <div className="grid grid-cols-4 bg-[#e8e5dc] p-0.5" role="radiogroup" aria-label="Size and position operation">
            {geometryTools.map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" role="radio" aria-checked={activeType === value} aria-label={label} className={cn("grid h-12 place-items-center gap-1 font-mono text-[7px] uppercase text-muted outline-none hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent", activeType === value && "bg-ink text-paper hover:bg-ink hover:text-acid")} onClick={() => onSelectEdit(value)}>
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>
        </section>

        {geometryDraft?.type === "crop" ? <CropControls version={version} draft={geometryDraft} onChange={updateLocalDraft} /> : null}
        {geometryDraft?.type === "resize" ? <ResizeControls version={version} draft={geometryDraft} onChange={updateLocalDraft} /> : null}
        {geometryDraft?.type === "rotate" ? <RotateControls draft={geometryDraft} onChange={updateLocalDraft} /> : null}
        {geometryDraft?.type === "flip" ? <FlipControls draft={geometryDraft} onChange={updateLocalDraft} /> : null}
        <p className="border-t border-line pt-3 font-mono text-[8px] uppercase leading-relaxed tracking-[.1em] text-muted">Changes stay live on canvas. Switching tools asks whether to save them.</p>
      </div>
    </div>
  );
}

function CropControls({ version, draft, onChange }: { version: ImageVersion; draft: Extract<LocalEditDraft, { type: "crop" }>; onChange: (draft: LocalEditDraft) => void }) {
  const rect = draft.parameters.sourceRect;
  const updateRect = (next: typeof rect) => onChange({ ...draft, parameters: { ...draft.parameters, sourceRect: clampCrop(next, version) } });
  return (
    <section className="grid gap-4 border-t border-line py-4" aria-label="Crop controls">
      <label className="grid gap-1.5 text-[10px] text-muted">Aspect ratio
        <select aria-label="Crop aspect ratio" className="h-9 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" value={draft.parameters.ratio} onChange={(event) => { const ratio = event.target.value as CropRatio; onChange({ ...draft, parameters: { ratio, sourceRect: fittedCrop(version, ratio) } }); }}>
          {cropRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio === "free" ? "Freeform" : ratio === "original" ? "Original" : ratio}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((field) => <NumberField key={field} label={field} value={Math.round(rect[field])} min={field === "width" || field === "height" ? 1 : 0} onChange={(value) => updateRect({ ...rect, [field]: value })} />)}
      </div>
      <p className="border-l-2 border-acid bg-[#edf5c4] p-3 text-[10px] leading-relaxed text-ink">Drag the crop frame or its handles directly on the image. The shaded area is removed only when you apply.</p>
      <button type="button" className="h-9 border border-line font-mono text-[9px] uppercase text-muted hover:bg-white/70 hover:text-ink" onClick={() => onChange({ ...draft, parameters: { ratio: "free", sourceRect: fittedCrop(version, "free") } })}>Reset crop</button>
    </section>
  );
}

function ResizeControls({ version, draft, onChange }: { version: ImageVersion; draft: Extract<LocalEditDraft, { type: "resize" }>; onChange: (draft: LocalEditDraft) => void }) {
  const parameters = draft.parameters;
  function update(next: Partial<typeof parameters>) { onChange({ ...draft, parameters: { ...parameters, ...next } }); }
  return (
    <section className="grid gap-4 border-t border-line py-4" aria-label="Resize controls">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Width" value={parameters.width} min={1} onChange={(width) => update({ width, height: parameters.preserveAspectRatio ? Math.max(1, Math.round(width * version.height / version.width)) : parameters.height })} />
        <NumberField label="Height" value={parameters.height} min={1} onChange={(height) => update({ height, width: parameters.preserveAspectRatio ? Math.max(1, Math.round(height * version.width / version.height)) : parameters.width })} />
      </div>
      <CheckRow label="Lock aspect ratio" checked={parameters.preserveAspectRatio} onChange={(preserveAspectRatio) => update({ preserveAspectRatio })} />
      <CheckRow label="Do not enlarge" checked={parameters.preventUpscale} onChange={(preventUpscale) => update({ preventUpscale })} />
      {(parameters.width > version.width || parameters.height > version.height) && !parameters.preventUpscale ? <p className="border-l-2 border-[#d98b00] bg-[#fff0c7] p-3 text-[10px] leading-relaxed text-[#6f4300]">Upscaling changes pixel dimensions but cannot recover detail absent from the source.</p> : null}
      <output className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Current {version.width} × {version.height}px · Output {parameters.width} × {parameters.height}px</output>
    </section>
  );
}

function RotateControls({ draft, onChange }: { draft: Extract<LocalEditDraft, { type: "rotate" }>; onChange: (draft: LocalEditDraft) => void }) {
  return (
    <section className="grid gap-3 border-t border-line py-4" aria-label="Rotate controls">
      <button type="button" className="flex h-10 items-center justify-center gap-2 bg-[#e8e5dc] text-xs font-bold hover:bg-white/70" onClick={() => onChange({ ...draft, parameters: { quarterTurns: draft.parameters.quarterTurns === 1 ? 3 : draft.parameters.quarterTurns === 2 ? 1 : 2 } })}><RotateCcw className="size-4" />Rotate left</button>
      <button type="button" className="flex h-10 items-center justify-center gap-2 bg-[#e8e5dc] text-xs font-bold hover:bg-white/70" onClick={() => onChange({ ...draft, parameters: { quarterTurns: draft.parameters.quarterTurns === 3 ? 1 : draft.parameters.quarterTurns === 2 ? 3 : 2 } })}><RotateCw className="size-4" />Rotate right</button>
      <output className="font-mono text-[8px] uppercase tracking-[.12em] text-muted">Live rotation · {draft.parameters.quarterTurns * 90}° clockwise</output>
    </section>
  );
}

function FlipControls({ draft, onChange }: { draft: Extract<LocalEditDraft, { type: "flip" }>; onChange: (draft: LocalEditDraft) => void }) {
  return (
    <section className="grid gap-3 border-t border-line py-4" aria-label="Flip controls">
      <button type="button" aria-pressed={draft.parameters.axis === "horizontal"} className={cn("flex h-10 items-center justify-center gap-2 bg-[#e8e5dc] text-xs font-bold hover:bg-white/70", draft.parameters.axis === "horizontal" && "bg-ink text-acid hover:bg-ink")} onClick={() => onChange({ ...draft, parameters: { axis: "horizontal" } })}><FlipHorizontal2 className="size-4" />Horizontal</button>
      <button type="button" aria-pressed={draft.parameters.axis === "vertical"} className={cn("flex h-10 items-center justify-center gap-2 bg-[#e8e5dc] text-xs font-bold hover:bg-white/70", draft.parameters.axis === "vertical" && "bg-ink text-acid hover:bg-ink")} onClick={() => onChange({ ...draft, parameters: { axis: "vertical" } })}><FlipVertical2 className="size-4" />Vertical</button>
    </section>
  );
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1 font-mono text-[8px] uppercase tracking-[.08em] text-muted">{label}<input aria-label={label === label.toLowerCase() ? `Crop ${label}` : label} className="h-9 min-w-0 bg-[#e8e5dc] px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" type="number" min={min} max={40000} value={value} onChange={(event) => onChange(Math.max(min, Math.round(Number(event.target.value) || min)))} /></label>;
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-10 items-center gap-2 bg-[#e8e5dc] px-3 text-[10px] text-ink"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function ratioNumber(ratio: CropRatio, version: ImageVersion): number | null {
  if (ratio === "free") return null;
  if (ratio === "original") return version.width / version.height;
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
}

function fittedCrop(version: ImageVersion, ratio: CropRatio) {
  const target = ratioNumber(ratio, version);
  if (!target) return { x: 0, y: 0, width: version.width, height: version.height };
  const sourceRatio = version.width / version.height;
  const width = sourceRatio > target ? version.height * target : version.width;
  const height = sourceRatio > target ? version.height : version.width / target;
  return { x: Math.round((version.width - width) / 2), y: Math.round((version.height - height) / 2), width: Math.round(width), height: Math.round(height) };
}

function clampCrop(rect: { x: number; y: number; width: number; height: number }, version: ImageVersion) {
  const x = Math.max(0, Math.min(version.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(version.height - 1, Math.round(rect.y)));
  return { x, y, width: Math.max(1, Math.min(version.width - x, Math.round(rect.width))), height: Math.max(1, Math.min(version.height - y, Math.round(rect.height))) };
}
