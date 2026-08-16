"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import { getMaskBounds } from "../mask";
import { useEditorStore } from "../store";
import type { ProcessingMask, Viewport } from "../types";

/** Anchors a compact selection affordance without covering the image with edit controls. */
export function SelectionChip({ mask, viewport, canvasSize }: { mask: ProcessingMask; viewport: Viewport; canvasSize: { width: number; height: number } }) {
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const diagnostics = useEditorStore((state) => state.selectionDiagnostics);
  const bounds = useMemo(() => getMaskBounds(mask), [mask]);
  if (!bounds) return null;

  const preferredLeft = viewport.x + (bounds.right + 1) * viewport.scale + 10;
  const selectionTop = viewport.y + bounds.top * viewport.scale;
  const left = Math.min(Math.max(10, preferredLeft), Math.max(10, canvasSize.width - 132));
  const top = Math.min(Math.max(10, selectionTop), Math.max(10, canvasSize.height - 42));
  const warning = Boolean(diagnostics?.warnings.length);

  return (
    <div className="selection-chip pointer-events-auto absolute z-20 flex h-8 items-center bg-paper pl-2.5 text-ink shadow-[3px_3px_0_rgba(0,0,0,.28)] ring-1 ring-ink/20" style={{ left, top }} data-testid="selection-chip">
      <span className={`mr-2 size-1.5 rounded-full ${warning ? "bg-[#ffad33]" : "bg-acid"}`} aria-hidden="true" />
      <span className="font-mono text-[9px] uppercase tracking-[.1em]">Selection</span>
      <button type="button" aria-label="Remove selection" title="Remove selection" className="ml-2 grid size-8 place-items-center text-muted hover:bg-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent" onClick={clearSelection}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}
