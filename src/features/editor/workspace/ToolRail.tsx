"use client";

import { Brush, Eraser, Hand, LassoSelect, PanelLeftClose, PanelLeftOpen, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "../store";
import type { Tool } from "../types";

const tools: Array<{ value: Tool; label: string; shortcut: string; icon: typeof Brush }> = [
  { value: "lasso", label: "Lasso", shortcut: "L", icon: LassoSelect },
  { value: "brush", label: "Brush", shortcut: "B", icon: Brush },
  { value: "eraser", label: "Eraser", shortcut: "E", icon: Eraser },
  { value: "pan", label: "Hand", shortcut: "H", icon: Hand },
];

export function ToolRail({ collapsed, disabled, transformSelected, onSelectTool, onSelectTransform, onToggleInspector }: { collapsed: boolean; disabled: boolean; transformSelected: boolean; onSelectTool: (tool: Tool) => void; onSelectTransform: () => void; onToggleInspector: () => void }) {
  const tool = useEditorStore((state) => state.tool);
  const hasPendingPaint = useEditorStore((state) => Boolean(state.paintSession));

  return (
    <nav className="relative z-30 flex h-12 items-center overflow-visible border-t border-line bg-[#e9e7df] md:h-auto md:flex-col md:border-r md:border-t-0" aria-label="Editor tools">
      <div className="flex flex-1 items-center justify-center md:w-full md:flex-none md:flex-col md:py-2" role="radiogroup" aria-label="Selection tool">
        {tools.map(({ value, label, shortcut, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={!transformSelected && tool === value}
            aria-label={label}
            title={`${label} (${shortcut})`}
            disabled={disabled}
            className={cn(
              "group relative grid size-11 place-items-center text-muted outline-none transition-[background-color,color,transform] hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-30",
              !transformSelected && tool === value && "bg-ink text-acid hover:bg-ink hover:text-acid",
            )}
            onClick={() => onSelectTool(value)}
          >
            <Icon className="size-[17px]" />
            {value === "brush" && hasPendingPaint && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-acid ring-1 ring-ink" aria-label="Paint pending" />}
            <ToolLabel label={label} shortcut={shortcut} />
            <span className="sr-only">{shortcut}</span>
          </button>
        ))}
      </div>
      <div className="border-line max-md:border-l md:w-full md:border-t md:py-1">
        <button
          type="button"
          data-testid="open-transform"
          aria-label="Transform"
          aria-pressed={transformSelected}
          title="Transform (T)"
          disabled={disabled}
          className={cn(
            "group relative grid size-11 place-items-center text-muted outline-none transition-[background-color,color,transform] hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-30 md:mx-auto",
            transformSelected && "bg-ink text-acid hover:bg-ink hover:text-acid",
          )}
          onClick={onSelectTransform}
        >
          <WandSparkles className="size-[17px]" />
          <ToolLabel label="Transform" shortcut="T" />
          <span className="sr-only">T</span>
        </button>
      </div>
      {tool !== "pan" && <button
        type="button"
        className="group relative grid size-11 place-items-center text-muted hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={collapsed ? "Open inspector" : "Collapse inspector"}
        title={collapsed ? "Open inspector" : "Collapse inspector"}
        onClick={onToggleInspector}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        <ToolLabel label={collapsed ? "Open inspector" : "Collapse inspector"} />
      </button>}
    </nav>
  );
}

function ToolLabel({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <span data-tooltip={label} className="pointer-events-none absolute z-50 whitespace-nowrap bg-ink px-2 py-1.5 font-mono text-[8px] uppercase tracking-[.08em] text-paper opacity-0 shadow-[3px_3px_0_rgba(216,244,65,.45)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:bottom-[calc(100%+6px)] max-md:left-1/2 max-md:-translate-x-1/2 md:left-[calc(100%+7px)] md:top-1/2 md:-translate-y-1/2">
      {label}{shortcut ? <span className="ml-1.5 text-acid">{shortcut}</span> : null}
    </span>
  );
}
