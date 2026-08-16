"use client";

import { Check, X } from "lucide-react";

export function DirectEditFooter({ applyLabel, disabled = false, onApply, onDiscard }: { applyLabel: string; disabled?: boolean; onApply: () => boolean; onDiscard: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-line p-3">
      <button type="button" data-testid="apply-local-edit" className="flex h-10 items-center justify-center gap-2 bg-acid px-3 text-xs font-bold text-ink outline-none hover:bg-ink hover:text-acid focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-35" disabled={disabled} onClick={onApply}>
        <Check className="size-4" />{applyLabel}
      </button>
      <button type="button" data-testid="discard-local-edit" className="flex h-10 items-center gap-1.5 px-3 font-mono text-[9px] uppercase text-muted outline-none hover:bg-[#e8e5dc] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent" onClick={onDiscard}>
        <X className="size-3.5" />Discard
      </button>
    </div>
  );
}
