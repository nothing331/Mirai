"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Check, Focus, ImagePlus, LoaderCircle, SlidersHorizontal, X } from "lucide-react";
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

export function CanvasFrame({ busyAction, onUpload, onAdjustTransform }: { busyAction: BusyAction; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onAdjustTransform: () => void }) {
  const [compareWith, setCompareWith] = useState<ComparisonBase>("original");
  const state = useEditorStore(useShallow((editor) => ({
    currentVersion: getCurrentVersion(editor),
    originalVersion: editor.versions.find((version) => version.id === editor.originalVersionId) ?? null,
    versions: editor.versions,
    currentVersionId: editor.currentVersionId,
    operations: editor.operations,
    preview: editor.preview,
    selectionMask: editor.selectionMask,
    color: editor.color,
    viewResetKey: editor.viewResetKey,
    viewport: editor.viewport,
    tool: editor.tool,
    acceptPreview: editor.acceptPreview,
    discardPreview: editor.discardPreview,
    requestViewReset: editor.requestViewReset,
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
            boundaryPolicy={state.preview.method === "generative" && state.preview.type !== "transform" ? state.preview.parameters.boundaryPolicy : null}
            candidateAnalysis={state.preview.method === "generative" ? state.preview.parameters.candidateAnalysis : null}
            transformFidelityAssessment={state.preview.method === "generative" && state.preview.type === "transform" ? state.preview.parameters.transformFidelityAssessment : null}
            transformPreview={state.preview.type === "transform"}
            acceptanceBlocked={state.preview.method === "generative" ? state.preview.type === "transform" ? blocksTransformAcceptance(state.preview.parameters.preservationMode, state.preview.parameters.transformFidelityAssessment) : blocksReplaceReviewAcceptance(state.preview.type, state.preview.parameters.boundaryPolicy, state.preview.parameters.candidateAnalysis) : false}
            onAccept={state.acceptPreview}
            onDiscard={state.discardPreview}
            onAdjustTransform={onAdjustTransform}
          />
        ) : state.currentVersion && state.selectionMask ? (
          <EditorCanvas version={state.currentVersion} mask={state.selectionMask} color={state.color} viewResetKey={state.viewResetKey} />
        ) : (
          <label className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 text-[#d4d1c8]">
            <span className="mb-2 grid size-14 place-items-center rounded-full border border-[#77746c] transition-[transform,background-color,color] group-hover:rotate-90 group-hover:bg-acid group-hover:text-ink"><ImagePlus className="size-5" /></span>
            <strong className="text-sm">Open an image</strong>
            <span className="font-mono text-[9px] uppercase tracking-[.12em] text-[#8e8b82]">PNG or JPEG</span>
            <input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={onUpload} />
          </label>
        )}
        {busyAction === "open" && <ProjectLoadingOverlay />}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 px-1 font-mono text-[8px] uppercase tracking-[.1em] text-[#5f5d56]" aria-label="Canvas status">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate">{state.currentVersion ? `${state.currentVersion.width} × ${state.currentVersion.height}px` : "Canvas"}</span>
          {state.currentVersion && <span className="hidden sm:inline">{Math.round(state.viewport.scale * 100)}%</span>}
          {state.currentVersion && <span className="hidden lg:inline">{state.tool}</span>}
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
function PreviewComparison({ baseLabel, originalUrl, previewUrl, boundaryPolicy, candidateAnalysis, transformFidelityAssessment, transformPreview, acceptanceBlocked, onAccept, onDiscard, onAdjustTransform }: {
  baseLabel: string;
  originalUrl: string;
  previewUrl: string;
  boundaryPolicy: EditBoundaryPolicy | null;
  candidateAnalysis: CandidateAnalysis | null;
  transformFidelityAssessment: TransformFidelityAssessment | null;
  transformPreview: boolean;
  acceptanceBlocked: boolean;
  onAccept: () => boolean;
  onDiscard: () => void;
  onAdjustTransform: () => void;
}) {
  return (
    <div className="preview-enter absolute inset-0 grid grid-rows-[auto_1fr_auto] bg-[#151513] p-2 sm:p-3" data-testid="preview-comparison">
      {boundaryPolicy && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[8px] uppercase tracking-wider text-white/65 sm:mb-3">
          <span>{boundaryPolicy === "review" ? "Complete AI proposal" : "Protected-mask composite"}</span>
          {candidateAnalysis && <span className={candidateAnalysis.changedOutsideSelectionPixels > 0 ? "text-[#ffb5a7]" : "text-acid"}>{candidateAnalysis.changedOutsideSelectionPixels > 0 ? `${Math.round(candidateAnalysis.changedOutsideSelectionRatio * 1000) / 10}% outside focus changed` : "Changes stayed inside focus"}</span>}
        </div>
      )}
      <div className="grid min-h-0 grid-cols-2 gap-2 sm:gap-3">
        <figure className="grid min-h-0 grid-rows-[auto_1fr] bg-black/15 ring-1 ring-white/15">
          <figcaption className="px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-white/65">{baseLabel}</figcaption>
          <div className="relative min-h-0"><Image src={originalUrl} alt="Original image" fill unoptimized className="object-contain" /></div>
        </figure>
        <figure className="grid min-h-0 grid-rows-[auto_1fr] bg-black/15 ring-1 ring-acid">
          <figcaption className="px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-acid">Preview</figcaption>
          <div className="relative min-h-0"><Image src={previewUrl} alt="Recolor preview" fill unoptimized className="object-contain" /></div>
        </figure>
      </div>
      <div className="flex flex-col gap-2 pt-2 sm:pt-3">
        {transformFidelityAssessment && transformFidelityAssessment.verdict !== "pass" && <p className={transformFidelityAssessment.verdict === "block" ? "bg-[#4a1f1a] px-3 py-2 font-mono text-[9px] leading-relaxed text-[#ffb5a7]" : "bg-[#443914] px-3 py-2 font-mono text-[9px] leading-relaxed text-[#ffe78a]"} role="alert" data-testid="transform-fidelity-assessment"><strong className="block uppercase">Transform fidelity {transformFidelityAssessment.verdict}</strong>{transformFidelityAssessment.explanation}</p>}
        {acceptanceBlocked && !transformFidelityAssessment && <p className="bg-[#4a1f1a] px-3 py-2 font-mono text-[9px] leading-relaxed text-[#ffb5a7]" role="alert" data-testid="replace-scope-mismatch">Scope mismatch: most changes landed outside the selected target. Discard and generate again, or switch to protected mode.</p>}
        <div className="flex justify-end gap-2">
          {transformPreview && <button type="button" className="flex h-9 items-center gap-2 px-3 text-xs font-bold text-white/75 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white" onClick={onAdjustTransform}><SlidersHorizontal className="size-4" />Adjust</button>}
          <button type="button" className="flex h-9 items-center gap-2 px-3 text-xs font-bold text-white/75 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white" onClick={onDiscard}><X className="size-4" />Discard</button>
          <button type="button" data-testid="accept-preview" className="flex h-9 items-center gap-2 bg-acid px-3 text-xs font-bold text-ink outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-acid disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40" disabled={acceptanceBlocked} onClick={onAccept}><Check className="size-4" />Accept edit</button>
        </div>
      </div>
    </div>
  );
}
