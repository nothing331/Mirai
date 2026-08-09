"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowRight, Check, ImageIcon, LoaderCircle, RefreshCcw, Shapes, Sparkles, UploadCloud, X } from "lucide-react";
import {
  assetCreationRequestSchema,
  assetGenerationSizes,
  assetStyles,
  type AssetCreationMode,
  type AssetCreationRequest,
  type AssetGenerationBrief,
  type AssetGenerationCandidate,
  type AssetGenerationCapabilities,
  type AssetGenerationResponse,
  type AssetGenerationSize,
} from "@/shared/asset-generation";
import { cn } from "@/lib/utils";
import { AssetGenerationRequestError, candidateDataUrl, getAssetGenerationCapabilities, requestAssetCandidates } from "./asset-generation-client";

export interface DisplayedAssetCandidate extends AssetGenerationCandidate {
  response: AssetGenerationResponse;
  request: AssetCreationRequest;
}

interface TransformSource {
  name: string;
  mimeType: "image/png" | "image/jpeg";
  dataBase64: string;
  previewUrl: string;
}

const styleLabels: Record<AssetGenerationBrief["style"], string> = {
  "minimal-geometric": "Geometric",
  monoline: "Monoline",
  flat: "Flat",
  bold: "Bold",
  playful: "Playful",
};

const modeOptions: Array<{ value: AssetCreationMode; label: string; shortLabel: string; icon: typeof Shapes }> = [
  { value: "mark", label: "Icon or logo mark", shortLabel: "Mark", icon: Shapes },
  { value: "image", label: "Generate image", shortLabel: "Image", icon: ImageIcon },
  { value: "transform", label: "Transform image", shortLabel: "Transform", icon: RefreshCcw },
];

const sizeLabels: Record<AssetGenerationSize, { label: string; dimensions: string }> = {
  "1024x1024": { label: "Square", dimensions: "1024 × 1024" },
  "1536x1024": { label: "Landscape", dimensions: "1536 × 1024" },
  "1024x1536": { label: "Portrait", dimensions: "1024 × 1536" },
};

const defaultBrief: AssetGenerationBrief = {
  assetType: "logo-mark",
  description: "A forward-looking compass formed from two interlocking shapes",
  style: "minimal-geometric",
  detail: "simple",
  colorMode: "auto",
  colors: [],
};

const defaultCustomColors = ["#171714", "#d8f441"];

export function AssetGenerationDialog({ open, onClose, onUseCandidate }: {
  open: boolean;
  onClose: () => void;
  onUseCandidate: (candidate: DisplayedAssetCandidate) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AssetCreationMode>("mark");
  const [brief, setBrief] = useState(defaultBrief);
  const [imagePrompt, setImagePrompt] = useState("A quiet coastal observatory at blue hour, cinematic natural light, editorial photography");
  const [transformPrompt, setTransformPrompt] = useState("Restyle this as a warm editorial illustration while preserving the composition and main subject");
  const [size, setSize] = useState<AssetGenerationSize>("1024x1024");
  const [source, setSource] = useState<TransformSource | null>(null);
  const [capabilities, setCapabilities] = useState<AssetGenerationCapabilities | null>(null);
  const [projectId, setProjectId] = useState(() => crypto.randomUUID());
  const [candidate, setCandidate] = useState<DisplayedAssetCandidate | null>(null);
  const [batchesUsed, setBatchesUsed] = useState(0);
  const [status, setStatus] = useState<"idle" | "generating" | "using">("idle");
  const [error, setError] = useState<string | null>(null);

  const draftRequest = useMemo(() => {
    if (mode === "mark") return { mode, brief, size: "1024x1024" };
    if (mode === "image") return { mode, prompt: imagePrompt, size };
    return { mode, prompt: transformPrompt, size, source: source ? { mimeType: source.mimeType, dataBase64: source.dataBase64 } : undefined };
  }, [brief, imagePrompt, mode, size, source, transformPrompt]);
  const validation = useMemo(() => assetCreationRequestSchema.safeParse(draftRequest), [draftRequest]);

  const closeDialog = useCallback(() => {
    setCandidate(null);
    setSource(null);
    setProjectId(crypto.randomUUID());
    setError(null);
    if (capabilities?.provider === "fake") setBatchesUsed(0);
    onClose();
  }, [capabilities?.provider, onClose]);

  useEffect(() => {
    if (!open) return;
    getAssetGenerationCapabilities().then((next) => {
      setCapabilities(next);
      if (next.provider === "openai") {
        const stored = Number.parseInt(sessionStorage.getItem("mirai-asset-generation-batches") ?? "0", 10);
        setBatchesUsed(Number.isFinite(stored) && stored > 0 ? stored : 0);
      }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "AI creation is unavailable."));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && status === "idle") closeDialog(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeDialog, open, status]);

  if (!open) return null;

  function selectMode(nextMode: AssetCreationMode) {
    setMode(nextMode);
    setCandidate(null);
    setError(null);
    if (nextMode === "mark") setSize("1024x1024");
  }

  async function generate() {
    if (!validation.success || !capabilities) return;
    if (capabilities.provider === "openai") {
      if (batchesUsed >= capabilities.maxBatchesPerSession) {
        setError(`The session limit of ${capabilities.maxBatchesPerSession} paid image requests has been reached.`);
        return;
      }
      const inputNote = mode === "transform" ? " The uploaded image also contributes input-token cost." : "";
      if (!window.confirm(`Create one ${mode === "mark" ? "mark" : mode === "image" ? "image" : "transformation"} with ${capabilities.model} at low quality?\n\nThis makes one paid image API request.${inputNote}`)) return;
      const nextUsage = batchesUsed + 1;
      setBatchesUsed(nextUsage);
      sessionStorage.setItem("mirai-asset-generation-batches", String(nextUsage));
    }
    setStatus("generating");
    setError(null);
    try {
      const response = await requestAssetCandidates(validation.data, projectId, crypto.randomUUID());
      const next = response.candidates[0];
      setCandidate(next ? { ...next, response, request: validation.data } : null);
      if (capabilities.provider === "fake") setBatchesUsed((current) => current + 1);
    } catch (cause) {
      if (capabilities.provider === "openai" && cause instanceof AssetGenerationRequestError && !cause.imageGenerationAttempted) {
        setBatchesUsed((current) => {
          const nextUsage = Math.max(0, current - 1);
          sessionStorage.setItem("mirai-asset-generation-batches", String(nextUsage));
          return nextUsage;
        });
      }
      setError(cause instanceof AssetGenerationRequestError && cause.retryable ? `${cause.message} You can try again.` : cause instanceof Error ? cause.message : "AI creation failed.");
    } finally {
      setStatus("idle");
    }
  }

  async function openSelected() {
    if (!candidate) return;
    setStatus("using");
    setError(null);
    try {
      const used = await onUseCandidate(candidate);
      if (!used) return;
      setProjectId(crypto.randomUUID());
      setCandidate(null);
      if (capabilities?.provider === "fake") setBatchesUsed(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The generated image could not be opened.");
    } finally {
      setStatus("idle");
    }
  }

  async function handleSource(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Choose a PNG or JPEG source image.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Keep the source image under 20 MB.");
      return;
    }
    const previewUrl = await readFileAsDataUrl(file);
    setSource({ name: file.name, mimeType: file.type, dataBase64: previewUrl.split(",")[1] ?? "", previewUrl });
    setCandidate(null);
    setError(null);
  }

  const modeLabel = mode === "mark" ? "mark" : mode === "image" ? "image" : "transformation";
  return (
    <div className="fixed inset-0 z-50 grid bg-black/65 p-2 backdrop-blur-[3px] sm:p-5" role="dialog" aria-modal="true" aria-labelledby="asset-generator-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close AI creator" onClick={status === "idle" ? closeDialog : undefined} />
      <section className="asset-dialog-enter relative m-auto grid h-full max-h-[900px] w-full max-w-[1180px] min-h-0 grid-rows-[auto_auto_1fr_auto] overflow-hidden border border-ink bg-paper shadow-[12px_12px_0_rgba(216,244,65,.75)]">
        <header className="flex items-start justify-between gap-4 border-b border-ink bg-ink px-4 py-3 text-paper sm:px-6 sm:py-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.2em] text-acid">Mirai / New original</p>
            <h2 id="asset-generator-title" className="mt-1 text-xl font-bold tracking-[-.04em] sm:text-2xl">Create with AI</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/55">Generate a mark, create a new image, or transform one reference. One low-quality result per request.</p>
          </div>
          <button type="button" aria-label="Close" className="grid size-9 place-items-center border border-white/30 text-white/70 hover:border-acid hover:text-acid disabled:opacity-30" disabled={status !== "idle"} onClick={closeDialog}><X className="size-4" /></button>
        </header>

        <div className="grid grid-cols-3 border-b border-ink bg-[#dedbd1]" role="tablist" aria-label="Creation mode">
          {modeOptions.map(({ value, label, shortLabel, icon: Icon }) => <button key={value} type="button" role="tab" aria-selected={mode === value} aria-label={label} className={cn("flex h-12 items-center justify-center gap-2 border-r border-ink font-mono text-[9px] uppercase tracking-wider last:border-r-0 sm:h-14", mode === value ? "bg-acid text-ink" : "bg-paper text-muted hover:bg-white hover:text-ink")} onClick={() => selectMode(value)}><Icon className="size-4" /><span>{shortLabel}</span></button>)}
        </div>

        <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[380px_minmax(0,1fr)] lg:overflow-hidden">
          <form className="grid content-start gap-5 border-b border-ink bg-[#dedbd1] p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-5" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
            {mode === "mark" && <MarkControls brief={brief} onChange={setBrief} />}
            {mode === "image" && <PromptControl label="Describe the image" hint="Include the subject, setting, composition, lighting, and visual treatment you want." value={imagePrompt} onChange={setImagePrompt} />}
            {mode === "transform" && <>
              <TransformSourceControl source={source} onChange={handleSource} onRemove={() => { setSource(null); setCandidate(null); }} />
              <PromptControl label="Transformation instruction" hint="Say what should change and what must remain recognizable." value={transformPrompt} onChange={setTransformPrompt} />
            </>}
            {mode === "mark" ? <div className="flex items-center justify-between border border-ink/40 bg-paper/55 px-3 py-2"><span className="font-mono text-[9px] uppercase tracking-wider">Resolution</span><span className="text-[10px] text-muted">Square · 1024 × 1024</span></div> : <ResolutionControl value={size} onChange={setSize} />}

            {error && <p role="alert" className="border-l-4 border-accent bg-[#fff0eb] p-3 text-xs leading-relaxed text-[#8f1d10]">{error}</p>}
            <button data-testid="generate-assets" type="submit" className="flex h-11 items-center justify-center gap-2 bg-ink px-4 text-xs font-bold text-paper outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35" disabled={!validation.success || !capabilities || status !== "idle"}>
              {status === "generating" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4 text-acid" />}
              {status === "generating" ? `Creating ${modeLabel}…` : candidate ? `Create another ${modeLabel}` : `Create ${modeLabel}`}
            </button>
            <p className="text-center font-mono text-[8px] uppercase tracking-wider text-muted">{capabilities ? `${capabilities.model} · low quality · 1 result` : "Loading configuration…"}</p>
          </form>

          <div className="grid min-h-[430px] grid-rows-[auto_1fr] bg-[#c9c6bc] lg:min-h-0 lg:overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ink px-4 py-3">
              <div><p className="font-mono text-[9px] uppercase tracking-[.15em] text-muted">Result</p><strong className="text-sm">{candidate ? `One temporary ${modeLabel}` : `Ready to create a ${modeLabel}`}</strong></div>
              <span className="font-mono text-[8px] uppercase tracking-wider text-muted">Low / Draft</span>
            </div>
            {!candidate ? <EmptyResult mode={mode} generating={status === "generating"} /> : (
              <div className="grid place-items-center p-4 sm:p-6">
                <div data-testid="asset-candidate-1" className="grid max-h-full w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] border border-accent bg-paper shadow-[7px_7px_0_#ef4b32]">
                  <span className="flex h-9 items-center justify-between border-b border-ink px-3 font-mono text-[9px] uppercase tracking-wider"><span>Generated result</span><span className="flex items-center gap-1 text-accent"><Check className="size-3" />Selected</span></span>
                  <span className="relative mx-auto w-full bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ddd_75%),linear-gradient(-45deg,transparent_75%,#ddd_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]" style={{ aspectRatio: `${candidate.width} / ${candidate.height}` }}><Image src={candidateDataUrl(candidate.candidateBase64)} alt={`Generated ${modeLabel}`} fill unoptimized className={cn("object-contain", mode === "mark" && "p-5")} /></span>
                  <span className="flex h-9 items-center justify-between border-t border-ink px-3 text-[10px]"><span>{candidate.width} × {candidate.height}</span><span className={candidate.transparency && candidate.transparency.status !== "clean" ? "text-[#9a4d00]" : "text-[#2c641d]"}>{candidate.transparency ? candidate.transparency.status === "clean" ? "Transparent PNG" : "Cleanup advised" : "Complete PNG"}</span></span>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink bg-paper px-4 py-3 sm:px-6">
          <p className="max-w-xl text-[10px] leading-relaxed text-muted">Using this result makes it the immutable original of a new project. The source reference is not stored with the project.</p>
          <button data-testid="use-generated-asset" type="button" className="flex h-10 items-center gap-2 bg-acid px-4 text-xs font-bold outline-none hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35" disabled={!candidate || status !== "idle"} onClick={() => void openSelected()}>{status === "using" ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}Use in Mirai</button>
        </footer>
      </section>
    </div>
  );
}

function MarkControls({ brief, onChange }: { brief: AssetGenerationBrief; onChange: (brief: AssetGenerationBrief) => void }) {
  return <>
    <fieldset className="grid grid-cols-2 border border-ink">
      <legend className="sr-only">Asset type</legend>
      {(["logo-mark", "icon"] as const).map((type) => <button key={type} type="button" className={cn("h-10 border-r border-ink font-mono text-[10px] uppercase tracking-wider last:border-r-0", brief.assetType === type ? "bg-acid font-medium" : "bg-paper hover:bg-white")} onClick={() => onChange({ ...brief, assetType: type })}>{type === "logo-mark" ? "Logo mark" : "Icon"}</button>)}
    </fieldset>
    <PromptControl label="Describe the idea" hint="Describe the symbol and mood. Text and existing brand imitation are intentionally excluded." maxLength={500} value={brief.description} onChange={(description) => onChange({ ...brief, description })} />
    <fieldset>
      <legend className="mb-2 font-mono text-[9px] uppercase tracking-wider">Visual style</legend>
      <div className="grid grid-cols-3 gap-px bg-ink">
        {assetStyles.map((style) => <button key={style} type="button" className={cn("h-9 bg-paper px-1 font-mono text-[9px] uppercase hover:bg-white", brief.style === style && "bg-accent text-white hover:bg-accent")} onClick={() => onChange({ ...brief, style })}>{styleLabels[style]}</button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend className="mb-2 font-mono text-[9px] uppercase tracking-wider">Detail</legend>
      <div className="grid grid-cols-3 border border-ink">
        {(["simple", "balanced", "detailed"] as const).map((detail) => <button key={detail} type="button" className={cn("h-9 border-r border-ink font-mono text-[9px] uppercase last:border-r-0", brief.detail === detail ? "bg-ink text-paper" : "bg-paper hover:bg-white")} onClick={() => onChange({ ...brief, detail })}>{detail}</button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend className="mb-2 font-mono text-[9px] uppercase tracking-wider">Palette</legend>
      <div className="grid grid-cols-2 border border-ink">
        <button type="button" aria-pressed={brief.colorMode === "auto"} className={cn("grid h-12 content-center border-r border-ink px-3 text-left", brief.colorMode === "auto" ? "bg-acid" : "bg-paper hover:bg-white")} onClick={() => onChange({ ...brief, colorMode: "auto", colors: [] })}><strong className="font-mono text-[10px] uppercase tracking-wider">Auto</strong><span className="text-[9px] text-muted">Model decides</span></button>
        <button type="button" aria-pressed={brief.colorMode === "custom"} className={cn("grid h-12 content-center px-3 text-left", brief.colorMode === "custom" ? "bg-ink text-paper" : "bg-paper hover:bg-white")} onClick={() => onChange({ ...brief, colorMode: "custom", colors: brief.colors.length ? brief.colors : defaultCustomColors })}><strong className="font-mono text-[10px] uppercase tracking-wider">Custom</strong><span className={cn("text-[9px]", brief.colorMode === "custom" ? "text-white/55" : "text-muted")}>Pick two colors</span></button>
      </div>
      {brief.colorMode === "auto" ? <div className="mt-2 flex min-h-12 items-center gap-3 border border-dashed border-ink/50 bg-paper/55 px-3 py-2"><span className="flex shrink-0 -space-x-1" aria-hidden="true"><i className="size-4 rounded-full bg-accent ring-1 ring-paper" /><i className="size-4 rounded-full bg-[#3158a4] ring-1 ring-paper" /><i className="size-4 rounded-full bg-acid ring-1 ring-paper" /></span><p className="text-[10px] leading-relaxed text-muted">The model chooses a cohesive palette for the idea.</p></div> : <div className="mt-2 grid grid-cols-2 gap-2">{brief.colors.map((color, index) => <label key={index} className="flex h-10 items-center gap-2 border border-ink bg-paper p-1 pr-2"><input aria-label={`Color ${index + 1}`} className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" type="color" value={color} onChange={(event) => onChange({ ...brief, colors: brief.colors.map((current, colorIndex) => colorIndex === index ? event.target.value : current) })} /><code className="text-[10px] uppercase">{color}</code></label>)}</div>}
    </fieldset>
  </>;
}

function PromptControl({ label, hint, value, maxLength = 2000, onChange }: { label: string; hint: string; value: string; maxLength?: number; onChange: (value: string) => void }) {
  return <label className="grid gap-2"><span className="flex justify-between font-mono text-[9px] uppercase tracking-wider"><span>{label}</span><span className="text-muted">{value.length}/{maxLength}</span></span><textarea data-testid="asset-description" className="min-h-32 resize-none border border-ink bg-paper p-3 text-sm leading-relaxed outline-none focus:shadow-[4px_4px_0_#ef4b32]" maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} /><span className="text-[10px] leading-relaxed text-muted">{hint}</span></label>;
}

function ResolutionControl({ value, onChange }: { value: AssetGenerationSize; onChange: (value: AssetGenerationSize) => void }) {
  return <fieldset><legend className="mb-2 font-mono text-[9px] uppercase tracking-wider">Resolution</legend><div className="grid grid-cols-3 gap-px bg-ink">{assetGenerationSizes.map((option) => <button key={option} type="button" aria-pressed={value === option} className={cn("grid h-14 content-center bg-paper px-1 hover:bg-white", value === option && "bg-ink text-paper hover:bg-ink")} onClick={() => onChange(option)}><strong className="font-mono text-[8px] uppercase tracking-wider">{sizeLabels[option].label}</strong><span className={cn("mt-1 text-[8px]", value === option ? "text-white/55" : "text-muted")}>{sizeLabels[option].dimensions}</span></button>)}</div></fieldset>;
}

function TransformSourceControl({ source, onChange, onRemove }: { source: TransformSource | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onRemove: () => void }) {
  return <fieldset><legend className="mb-2 font-mono text-[9px] uppercase tracking-wider">Source image</legend>{source ? <div className="grid grid-cols-[76px_1fr_auto] items-center gap-3 border border-ink bg-paper p-2"><span className="relative aspect-square overflow-hidden bg-[#cbc8be]"><Image src={source.previewUrl} alt="Transform source" fill unoptimized className="object-cover" /></span><span className="min-w-0"><strong className="block truncate text-xs">{source.name}</strong><small className="mt-1 block font-mono text-[8px] uppercase text-muted">One reference · temporary</small></span><button type="button" className="grid size-8 place-items-center text-muted hover:bg-[#ffd5cc] hover:text-accent" aria-label="Remove source image" onClick={onRemove}><X className="size-4" /></button></div> : <label className="group grid min-h-28 cursor-pointer place-items-center border border-dashed border-ink bg-paper/60 p-4 text-center hover:border-accent hover:bg-paper"><span><UploadCloud className="mx-auto mb-2 size-5 transition-transform group-hover:-translate-y-0.5" /><strong className="block text-xs">Upload one source image</strong><small className="mt-1 block font-mono text-[8px] uppercase tracking-wider text-muted">PNG or JPEG · up to 20 MB</small></span><input data-testid="transform-source-input" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={onChange} /></label>}</fieldset>;
}

function EmptyResult({ mode, generating }: { mode: AssetCreationMode; generating: boolean }) {
  const copy = mode === "mark" ? "A strict prompt keeps the mark isolated and suitable for local transparency cleanup." : mode === "image" ? "Describe a complete scene or visual. The result opens directly in the editor for refinement." : "The source guides identity and composition; your instruction describes what should change.";
  return <div className="grid place-items-center p-8 text-center"><div className="max-w-sm"><span className={cn("mx-auto mb-5 grid size-16 place-items-center border border-ink bg-paper shadow-[7px_7px_0_#d8f441]", generating && "animate-pulse")}><Sparkles className="size-6" /></span><strong className="text-base">{generating ? "Creating one result" : "Your result will appear here"}</strong><p className="mt-2 text-xs leading-relaxed text-muted">{copy}</p></div></div>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The source image could not be read."));
    reader.onerror = () => reject(new Error("The source image could not be read."));
    reader.readAsDataURL(file);
  });
}
