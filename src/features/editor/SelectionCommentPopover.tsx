"use client";

import { MessageSquareText, Palette, Sparkles, X } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMaskBounds } from "./mask";
import { useEditorStore } from "./store";
import type { EditType, ProcessingMask, Viewport } from "./types";

const operations: Array<{ value: EditType; label: string }> = [
  { value: "recolor", label: "Color" },
  { value: "remove", label: "Remove" },
  { value: "replace", label: "Replace" },
  { value: "restyle", label: "Restyle" },
];

function instructionLabel(editType: EditType) {
  if (editType === "replace") return "Describe what belongs here";
  if (editType === "restyle") return "Describe the new finish or style";
  return "Optional reconstruction note";
}

function instructionPlaceholder(editType: EditType) {
  if (editType === "replace") return "Add a complete object that matches the scene…";
  if (editType === "restyle") return "Keep the structure; change the material to…";
  return "Continue the wall, floor, sky, or background…";
}

/** Keeps edit intent physically attached to the selected source region. */
export function SelectionCommentPopover({
  mask,
  viewport,
  canvasSize,
  selectionId,
  onPreview,
}: {
  mask: ProcessingMask;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  selectionId: string;
  onPreview: () => void;
}) {
  const [dismissedSelectionId, setDismissedSelectionId] = React.useState<string | null>(null);
  const { editType, prompt, color, generativeState, setEditType, setPrompt, setColor } = useEditorStore();
  const bounds = getMaskBounds(mask);
  if (!bounds) return null;

  const panelWidth = Math.min(304, Math.max(240, canvasSize.width - 24));
  const selectionRight = viewport.x + (bounds.right + 1) * viewport.scale;
  const selectionLeft = viewport.x + bounds.left * viewport.scale;
  const selectionTop = viewport.y + bounds.top * viewport.scale;
  const preferredLeft = selectionRight + 14 + panelWidth <= canvasSize.width ? selectionRight + 14 : selectionLeft - panelWidth - 14;
  const left = Math.min(Math.max(12, preferredLeft), Math.max(12, canvasSize.width - panelWidth - 12));
  const top = Math.min(Math.max(12, selectionTop), Math.max(12, canvasSize.height - 292));
  const isOpen = dismissedSelectionId !== selectionId;
  const processing = generativeState.status === "processing";

  if (!isOpen) {
    return (
      <button
        className="pointer-events-auto absolute z-20 flex items-center gap-2 border border-acid bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[.08em] text-acid shadow-[3px_3px_0_rgba(216,244,65,.45)] hover:bg-acid hover:text-ink"
        style={{ left, top }}
        onClick={() => setDismissedSelectionId(null)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <MessageSquareText className="size-3.5" />Edit selection
      </button>
    );
  }

  return (
    <section
      aria-label="Selection edit comment"
      className="pointer-events-auto absolute z-20 grid w-[min(304px,calc(100%-24px))] gap-3 border border-acid bg-[#191916]/95 p-3 text-white shadow-[5px_5px_0_rgba(0,0,0,.45)] backdrop-blur-sm"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/15 pb-2">
        <div>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.14em] text-acid"><MessageSquareText className="size-3.5" />Selection note</div>
          <p className="mt-1 text-[11px] leading-snug text-white/65">Describe only what should change here.</p>
        </div>
        <button aria-label="Close selection comment" className="grid size-7 place-items-center border border-white/20 text-white/70 hover:border-white hover:text-white" onClick={() => setDismissedSelectionId(selectionId)}><X className="size-3.5" /></button>
      </header>

      <div className="grid grid-cols-4 gap-1" aria-label="On-canvas edit operation">
        {operations.map((operation) => (
          <button
            key={operation.value}
            className={cn("border px-1 py-2 font-mono text-[9px] uppercase tracking-wide", editType === operation.value ? "border-acid bg-acid text-ink" : "border-white/20 text-white/70 hover:border-white/60 hover:text-white")}
            aria-pressed={editType === operation.value}
            onClick={() => setEditType(operation.value)}
          >
            {operation.label}
          </button>
        ))}
      </div>

      {editType === "recolor" ? (
        <label className="flex items-center gap-3 border border-white/20 p-1 font-mono text-[10px] uppercase tracking-wide text-white/75">
          <input aria-label="On-canvas recolor" className="h-9 w-11 cursor-pointer border-0 bg-transparent p-0" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          <Palette className="size-3.5 text-acid" />{color.toUpperCase()}
        </label>
      ) : (
        <label className="grid gap-1.5 text-[11px] text-white/75">
          <span>{instructionLabel(editType)}</span>
          <textarea
            aria-label="On-canvas edit instruction"
            className="min-h-20 resize-none border border-white/25 bg-black/20 p-2.5 text-xs leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-acid"
            value={prompt}
            placeholder={instructionPlaceholder(editType)}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onPreview();
              }
            }}
          />
        </label>
      )}

      <Button data-testid="on-canvas-preview" variant="accent" disabled={processing} onClick={onPreview}>
        <Sparkles className={cn("size-4", processing && "animate-pulse")} />
        {processing ? "Processing…" : editType === "recolor" ? "Preview recolor" : "Generate preview"}
      </Button>
      {editType !== "recolor" && <p className="font-mono text-[8px] uppercase tracking-[.1em] text-white/35">Ctrl / ⌘ + Enter to generate</p>}
    </section>
  );
}
