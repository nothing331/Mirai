"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Check, Focus, ImagePlus, LoaderCircle, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { blocksReplaceReviewAcceptance } from "@/shared/edit-boundary";
import type { CandidateAnalysis, EditBoundaryPolicy } from "@/shared/edit-boundary";
import { blocksTransformAcceptance } from "@/shared/transform-fidelity";
import type { TransformFidelityAssessment } from "@/shared/transform-fidelity";
import { getCurrentVersion, useEditorStore } from "../store";
import type { BusyAction, ComparisonBase } from "./workspace-types";

const EditorCanvas = dynamic(() => import("../EditorCanvas").then((module) => module.EditorCanvas), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center font-mono text-xs text-white">Preparing canvas…</div>,
});

export function CanvasFrame({ busyAction, onUpload, onGenerateAsset, extendSelected, onAdjustTransform, onAdjustExtend }: { busyAction: BusyAction; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onGenerateAsset: () => void; extendSelected: boolean; onAdjustTransform: () => void; onAdjustExtend: () => void }) {
  const [compareWith, setCompareWith] = useState<ComparisonBase>("original");
  const state = useEditorStore(useShallow((editor) => ({
    currentVersion: getCurrentVersion(editor),
    originalVersion: editor.versions.find((version) => version.id === editor.originalVersionId) ?? null,
    versions: editor.versions,
    currentVersionId: editor.currentVersionId,
    operations: editor.operations,
    preview: editor.preview,
    localDraft: editor.localDraft,
    selectionMask: editor.selectionMask,
    color: editor.color,
    viewResetKey: editor.viewResetKey,
    viewport: editor.viewport,
    tool: editor.tool,
    acceptPreview: editor.acceptPreview,
    discardPreview: editor.discardPreview,
    requestViewReset: editor.requestViewReset,
    extendState: editor.extendState,
  })));
  const currentIndex = state.versions.findIndex((version) => version.id === state.currentVersionId);
  const comparisonVersion = compareWith === "previous" && currentIndex > 0 ? state.versions[currentIndex - 1] : state.originalVersion;

  return (
    <section className="order-1 grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_28px] bg-[#cfcdc5] p-2 pb-0 md:order-2 md:p-3 md:pb-0" aria-label="Image canvas">
      <div className="relative min-h-0 overflow-hidden bg-[#151513] shadow-[0_1px_0_rgba(255,255,255,.35)]">
        {state.preview && comparisonVersion && state.currentVersion ? (
          <PreviewComparison
            baseLabel={compareWith === "previous" ? "Previous" : "Original"}
            originalUrl={comparisonVersion.dataUrl}
            previewUrl={state.preview.dataUrl}
            boundaryPolicy={state.preview.method === "generative" && (state.preview.type === "remove" || state.preview.type === "replace" || state.preview.type === "restyle") ? state.preview.parameters.boundaryPolicy : null}
            candidateAnalysis={state.preview.method === "generative" && (state.preview.type === "remove" || state.preview.type === "replace" || state.preview.type === "restyle" || state.preview.type === "transform") ? state.preview.parameters.candidateAnalysis : null}
            transformFidelityAssessment={state.preview.method === "generative" && state.preview.type === "transform" ? state.preview.parameters.transformFidelityAssessment : null}
            transformPreview={state.preview.type === "transform"}
            extendPreview={state.preview.type === "extend"}
            acceptanceBlocked={state.preview.method === "generative" ? state.preview.type === "transform" ? blocksTransformAcceptance(state.preview.parameters.preservationMode, state.preview.parameters.transformFidelityAssessment) : state.preview.type === "extend" ? false : blocksReplaceReviewAcceptance(state.preview.type, state.preview.parameters.boundaryPolicy, state.preview.parameters.candidateAnalysis) : false}
            onAccept={state.acceptPreview}
            onDiscard={state.discardPreview}
            onAdjustTransform={onAdjustTransform}
            onAdjustExtend={onAdjustExtend}
          />
        ) : extendSelected && state.currentVersion && (state.extendState.status === "planned" || state.extendState.status === "generating") ? (
          <ExtendPlanCanvas imageUrl={state.currentVersion.dataUrl} imageWidth={state.currentVersion.width} imageHeight={state.currentVersion.height} plan={state.extendState.plan} processingPhase={state.extendState.status === "generating" ? state.extendState.phase : null} />
        ) : state.currentVersion && state.selectionMask ? (
          <EditorCanvas version={state.currentVersion} mask={state.selectionMask} color={state.color} viewResetKey={state.viewResetKey} />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-[#d4d1c8]">
            <div className="grid w-full max-w-xl gap-6 text-center">
              <div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-acid">Start a new original</p><h2 className="mt-2 text-2xl font-bold tracking-[-.04em] text-paper sm:text-3xl">Bring an image—or invent the mark.</h2></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="group grid min-h-36 cursor-pointer place-items-center border border-[#77746c] p-5 hover:border-paper hover:bg-white/5">
                  <span><ImagePlus className="mx-auto mb-3 size-5 transition-transform group-hover:rotate-90" /><strong className="block text-sm">Open an image</strong><small className="mt-1 block font-mono text-[8px] uppercase tracking-wider text-[#8e8b82]">PNG or JPEG</small></span>
                  <input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={onUpload} />
                </label>
                <button data-testid="open-asset-generator" type="button" className="group grid min-h-36 place-items-center border border-acid bg-acid p-5 text-ink hover:bg-paper" onClick={onGenerateAsset}>
                  <span><Sparkles className="mx-auto mb-3 size-5 transition-transform group-hover:scale-125" /><strong className="block text-sm">Create with AI</strong><small className="mt-1 block font-mono text-[8px] uppercase tracking-wider text-muted">Logo mark · icon · image</small></span>
                </button>
              </div>
            </div>
          </div>
        )}
        {busyAction === "open" && <ProjectLoadingOverlay />}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 px-1 font-mono text-[8px] uppercase tracking-[.1em] text-[#5f5d56]" aria-label="Canvas status">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate">{state.currentVersion ? `${state.currentVersion.width} × ${state.currentVersion.height}px` : "Canvas"}</span>
          {state.currentVersion && <span className="hidden sm:inline">{Math.round(state.viewport.scale * 100)}%</span>}
          {state.currentVersion && <span className="hidden lg:inline">{state.localDraft?.type ?? state.tool}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.preview && (
            <label className="flex items-center gap-1.5">Compare<select aria-label="Comparison base" className="h-6 bg-transparent text-[8px] outline-none focus:ring-1 focus:ring-accent" value={compareWith} onChange={(event) => setCompareWith(event.target.value as ComparisonBase)}><option value="original">Original</option><option value="previous">Previous</option></select></label>
          )}
          <span>{state.operations.length} accepted edit{state.operations.length === 1 ? "" : "s"}</span>
          <button type="button" aria-label="Reset view" title="Reset view" className="grid size-6 place-items-center hover:bg-white/50 hover:text-ink disabled:opacity-30" disabled={!state.currentVersion} onClick={state.requestViewReset}><Focus className="size-3" /></button>
        </div>
      </div>
    </section>
  );
}

function ProjectLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#151513]/82 text-paper backdrop-blur-[3px]" role="status" aria-live="polite" data-testid="project-loading-overlay">
      <div className="grid justify-items-center gap-3 bg-[#151513] px-8 py-6 shadow-[6px_6px_0_rgba(216,244,65,.35)] ring-1 ring-white/20">
        <LoaderCircle className="size-7 animate-spin text-acid" />
        <strong className="text-sm">Opening project</strong>
        <span className="font-mono text-[9px] uppercase tracking-[.14em] text-white/55">Restoring image and edit history</span>
      </div>
    </div>
  );
}

/** Shows the immutable base and unaccepted candidate before history advances. */
function PreviewComparison({ baseLabel, originalUrl, previewUrl, boundaryPolicy, candidateAnalysis, transformFidelityAssessment, transformPreview, extendPreview, acceptanceBlocked, onAccept, onDiscard, onAdjustTransform, onAdjustExtend }: {
  baseLabel: string;
  originalUrl: string;
  previewUrl: string;
  boundaryPolicy: EditBoundaryPolicy | null;
  candidateAnalysis: CandidateAnalysis | null;
  transformFidelityAssessment: TransformFidelityAssessment | null;
  transformPreview: boolean;
  extendPreview: boolean;
  acceptanceBlocked: boolean;
  onAccept: () => boolean;
  onDiscard: () => void;
  onAdjustTransform: () => void;
  onAdjustExtend: () => void;
}) {
  const reviewLabel = boundaryPolicy
    ? boundaryPolicy === "review" ? "Complete AI proposal" : "Protected-mask composite"
    : extendPreview ? "Complete AI extension" : transformPreview ? "Full-image transformation" : "Edit proposal";
  return (
    <div className="preview-enter absolute inset-0 grid grid-rows-[auto_1fr_auto] bg-[#151513] p-2 sm:p-3" data-testid="preview-comparison">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[8px] uppercase tracking-wider text-white/65 sm:mb-3">
        <span>{reviewLabel}</span>
        {candidateAnalysis && <span className={candidateAnalysis.changedOutsideSelectionPixels > 0 ? "text-[#ffb5a7]" : "text-acid"}>{candidateAnalysis.changedOutsideSelectionPixels > 0 ? `${Math.round(candidateAnalysis.changedOutsideSelectionRatio * 1000) / 10}% outside focus changed` : "Changes stayed inside focus"}</span>}
      </div>
      <div className="grid min-h-0 grid-cols-2 gap-2 sm:gap-3">
        <figure className="grid min-h-0 grid-rows-[auto_1fr] bg-black/15 ring-1 ring-white/15">
          <figcaption className="px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-white/65">{baseLabel}</figcaption>
          <div className="relative min-h-0 overflow-hidden" data-testid="comparison-source"><Image src={originalUrl} alt={`${baseLabel} image`} fill unoptimized sizes="50vw" className="object-contain" /></div>
        </figure>
        <figure className="grid min-h-0 grid-rows-[auto_1fr] bg-black/15 ring-1 ring-acid">
          <figcaption className="px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-acid">Preview</figcaption>
          <div className="relative min-h-0 overflow-hidden" data-testid="comparison-candidate"><Image src={previewUrl} alt="Generated preview" fill unoptimized sizes="50vw" className="object-contain" /></div>
        </figure>
      </div>
      <div className="flex flex-col gap-2 pt-2 sm:pt-3">
        {transformFidelityAssessment && transformFidelityAssessment.verdict !== "pass" && <p className={transformFidelityAssessment.verdict === "block" ? "bg-[#4a1f1a] px-3 py-2 font-mono text-[9px] leading-relaxed text-[#ffb5a7]" : "bg-[#443914] px-3 py-2 font-mono text-[9px] leading-relaxed text-[#ffe78a]"} role="alert" data-testid="transform-fidelity-assessment"><strong className="block uppercase">Transform fidelity {transformFidelityAssessment.verdict}</strong>{transformFidelityAssessment.explanation}</p>}
        {acceptanceBlocked && !transformFidelityAssessment && <p className="bg-[#4a1f1a] px-3 py-2 font-mono text-[9px] leading-relaxed text-[#ffb5a7]" role="alert" data-testid="replace-scope-mismatch">Scope mismatch: most changes landed outside the selected target. Discard and generate again, or switch to protected mode.</p>}
        <div className="flex justify-end gap-2">
          {transformPreview && <button type="button" className="flex h-9 items-center gap-2 px-3 text-xs font-bold text-white/75 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white" onClick={onAdjustTransform}><SlidersHorizontal className="size-4" />Adjust</button>}
          {extendPreview && <button type="button" className="flex h-9 items-center gap-2 px-3 text-xs font-bold text-white/75 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white" onClick={onAdjustExtend}><SlidersHorizontal className="size-4" />Adjust frame</button>}
          <button type="button" className="flex h-9 items-center gap-2 px-3 text-xs font-bold text-white/75 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white" onClick={onDiscard}><X className="size-4" />Discard</button>
          <button type="button" data-testid="accept-preview" className="flex h-9 items-center gap-2 bg-acid px-3 text-xs font-bold text-ink outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-acid disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40" disabled={acceptanceBlocked} onClick={onAccept}><Check className="size-4" />Accept edit</button>
        </div>
      </div>
    </div>
  );
}

function ExtendPlanCanvas({ imageUrl, imageWidth, imageHeight, plan, processingPhase }: { imageUrl: string; imageWidth: number; imageHeight: number; plan: import("@/shared/extend-plan").SmartReframePlan; processingPhase: "sending" | "generating" | "preparing" | null }) {
  const placement = plan.sourcePlacement;
  const crop = plan.sourceCrop;
  const processingLabel = processingPhase === "sending" ? "Preparing source" : processingPhase === "preparing" ? "Preparing comparison" : processingPhase === "generating" ? "Generating surroundings" : null;
  return (
    <div className="absolute inset-0 grid place-items-center p-8" data-testid="extend-plan-canvas">
      <div className="relative max-h-full max-w-full overflow-hidden bg-[repeating-linear-gradient(135deg,#2d2d2a_0,#2d2d2a_8px,#252522_8px,#252522_16px)] ring-1 ring-acid shadow-[8px_8px_0_rgba(216,244,65,.18)]" style={{ aspectRatio: `${plan.outputWidth}/${plan.outputHeight}`, width: plan.outputWidth >= plan.outputHeight ? "min(82%,1000px)" : "auto", height: plan.outputHeight > plan.outputWidth ? "min(82%,720px)" : "auto" }}>
        <div className="absolute overflow-hidden ring-1 ring-white/35" style={{ left: `${placement.x / plan.outputWidth * 100}%`, top: `${placement.y / plan.outputHeight * 100}%`, width: `${placement.width / plan.outputWidth * 100}%`, height: `${placement.height / plan.outputHeight * 100}%` }}>
          <Image src={imageUrl} alt="Source positioned inside proposed Extend frame" unoptimized width={imageWidth} height={imageHeight} className="absolute max-w-none" style={{ width: `${imageWidth / crop.width * 100}%`, height: `${imageHeight / crop.height * 100}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` }} />
        </div>
        <div className="pointer-events-none absolute inset-0 border border-acid/70" />
        <span className="absolute bottom-2 right-2 bg-ink/85 px-2 py-1 font-mono text-[8px] uppercase tracking-[.1em] text-acid">{plan.outputWidth} × {plan.outputHeight}</span>
      </div>
      {processingLabel && (
        <div className="absolute inset-0 grid place-items-center bg-[#151513]/72 text-paper backdrop-blur-[2px]" role="status" aria-live="polite" data-testid="extend-processing-overlay">
          <div className="grid justify-items-center gap-3 border border-white/20 bg-[#151513] px-7 py-5 shadow-[6px_6px_0_rgba(216,244,65,.3)]">
            <LoaderCircle className="size-6 animate-spin text-acid" />
            <strong className="text-sm">{processingLabel}</strong>
            <span className="font-mono text-[8px] uppercase tracking-[.14em] text-white/55">The planned frame stays fixed</span>
          </div>
        </div>
      )}
    </div>
  );
}
