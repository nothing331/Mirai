"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { ChangeEvent, useState } from "react";
import { Brush, Check, Download, Eraser, Focus, Hand, ImagePlus, LassoSelect, RotateCcw, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { decodeImage, exportVersion } from "./image-data";
import { getCurrentVersion, useEditorStore } from "./store";
import type { Tool } from "./types";

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

/** Composes upload, closed-region selection, preview, and acceptance controls. */
export function EditorWorkspace() {
  const state = useEditorStore();
  const currentVersion = getCurrentVersion(state);
  const originalVersion = state.versions.find((version) => version.id === state.originalVersionId) ?? null;
  const [loading, setLoading] = useState(false);

  /** Validates and decodes a local image without uploading it to a server. */
  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLoading(true);
    state.setError(null);
    try {
      state.loadImage(await decodeImage(file));
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "The image could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper bg-[linear-gradient(rgba(23,23,20,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(23,23,20,.035)_1px,transparent_1px)] bg-[size:24px_24px] p-3 text-ink sm:p-5">
      <header className="flex min-h-24 items-end justify-between border-y border-t-[6px] border-ink py-4">
        <div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-wider">Browser image lab / v0.1</p>
          <h1 className="text-5xl font-bold leading-[.8] tracking-[-.065em] sm:text-7xl lg:text-[5.25rem]">Local Edit</h1>
        </div>
        <p className="hidden max-w-md text-right font-mono text-[11px] uppercase leading-relaxed tracking-wide sm:block">Paint a region. Change its color. Keep every other pixel intact.</p>
      </header>

      <section className="grid min-h-[calc(100vh-145px)] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="pt-5 md:border-r md:border-ink md:pr-5" aria-label="Editor tools">
          <ControlSection number="01" title="Open" subtitle="PNG or JPEG" className="pt-0">
            <label className={cn(buttonVariants(), "relative w-full cursor-pointer")}>
              <ImagePlus className="size-4" />
              {loading ? "Opening…" : currentVersion ? "Replace image" : "Choose image"}
              <input data-testid="file-input" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={handleUpload} disabled={loading} />
            </label>
          </ControlSection>

          <fieldset disabled={!currentVersion} className="m-0 grid min-w-0 border-0 p-0 disabled:opacity-45 max-md:grid-cols-2 max-md:gap-4 max-sm:grid-cols-1">
            <ControlSection number="02" title="Select" subtitle="Draw around the area to recolor">
              <ToggleGroup className="grid-cols-4" type="single" value={state.tool} onValueChange={(value) => value && state.setTool(value as Tool)} aria-label="Selection tool">
                {tools.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem key={value} value={value} aria-label={label}><Icon className="size-3.5" />{label}</ToggleGroupItem>
                ))}
              </ToggleGroup>

              {state.tool === "lasso" && (
                <p className="border-l-2 border-accent pl-2 text-xs leading-relaxed text-muted">Draw around an object or area. Releasing the pointer automatically closes the contour and fills everything inside it.</p>
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

            <ControlSection number="03" title="Recolor" subtitle="Apply directly to selection">
              <label className="flex h-12 items-center gap-3 border border-ink p-1 font-mono text-[11px]">
                <input aria-label="Recolor" className="h-9 w-10 cursor-pointer border-0 bg-transparent p-0" type="color" value={state.color} onChange={(event) => state.setColor(event.target.value)} />
                <span>{state.color.toUpperCase()}</span>
              </label>
              <Button data-testid="apply-edit" variant="accent" onClick={state.createPreview}>Preview recolor</Button>
              <p className="text-[11px] leading-relaxed text-muted">Preview first, then accept or discard. The filled interior—not its outline—is recolored.</p>
              <Button variant="quiet" onClick={state.reset}><RotateCcw className="size-3.5" />Reset to original</Button>
              <Button variant="quiet" onClick={() => currentVersion && exportVersion(currentVersion)}><Download className="size-3.5" />Export current image</Button>
            </ControlSection>
          </fieldset>

          {state.error && <p className="border-l-4 border-accent bg-[#ffd5cc] p-3 text-xs leading-relaxed text-[#8f1d10]" role="alert">{state.error}</p>}
        </aside>

        <section className="grid min-w-0 grid-rows-[auto_minmax(460px,1fr)_auto] pt-5 md:pl-5" aria-label="Image canvas">
          <div className="flex justify-between pb-2.5 font-mono text-[10px] uppercase tracking-wider">
            <span>{currentVersion ? `${currentVersion.width} × ${currentVersion.height}px` : "No image loaded"}</span>
            <span>{state.operations.length} accepted edit{state.operations.length === 1 ? "" : "s"}</span>
          </div>
          <div className="relative min-h-[460px] overflow-hidden border border-ink bg-[#151513] shadow-[6px_6px_0_rgba(23,23,20,.15)]">
            {state.preview && originalVersion && currentVersion ? (
              <PreviewComparison originalUrl={originalVersion.dataUrl} previewUrl={state.preview.dataUrl} onAccept={state.acceptPreview} onDiscard={state.discardPreview} />
            ) : currentVersion && state.selectionMask ? <EditorCanvas version={currentVersion} mask={state.selectionMask} color={state.color} viewResetKey={state.viewResetKey} /> : (
              <label className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 text-[#d4d1c8]">
                <span className="mb-2 grid size-14 place-items-center rounded-full border border-[#77746c] text-3xl transition group-hover:rotate-90 group-hover:bg-acid group-hover:text-ink">+</span>
                <strong className="text-base">Drop into the process</strong>
                <span className="text-xs text-[#8e8b82]">Choose a PNG or JPEG to begin.</span>
                <input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={handleUpload} />
              </label>
            )}
          </div>
          <p className="mt-3 font-mono text-[9px] uppercase leading-relaxed tracking-wide text-muted">Draw a closed lasso to fill · Brush or erase to refine · Scroll to zoom · Pan to move</p>
        </section>
      </section>
    </main>
  );
}

/** Shows the immutable original and unaccepted candidate before history advances. */
function PreviewComparison({ originalUrl, previewUrl, onAccept, onDiscard }: { originalUrl: string; previewUrl: string; onAccept: () => boolean; onDiscard: () => void }) {
  return (
    <div className="absolute inset-0 grid grid-rows-[1fr_auto] bg-[#151513] p-3" data-testid="preview-comparison">
      <div className="grid min-h-0 grid-cols-2 gap-3">
        <figure className="grid min-h-0 grid-rows-[auto_1fr] border border-white/20">
          <figcaption className="border-b border-white/20 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white">Original</figcaption>
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
    <section className={cn("grid grid-cols-[28px_1fr] gap-x-2.5 gap-y-4 border-b border-line py-5", className)}>
      <span className="pt-1 font-mono text-[10px] uppercase tracking-wider">{number}</span>
      <div><h2 className="text-xl font-bold tracking-tight">{title}</h2><p className="mt-0.5 text-xs text-muted">{subtitle}</p></div>
      <div className="col-span-2 grid gap-3">{children}</div>
    </section>
  );
}
