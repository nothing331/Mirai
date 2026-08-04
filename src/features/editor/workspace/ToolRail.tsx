"use client";

import { Brush, Eraser, Hand, LassoSelect, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "../store";
import type { Tool } from "../types";

const tools: Array<{ value: Tool; label: string; shortcut: string; icon: typeof Brush }> = [
  { value: "lasso", label: "Lasso", shortcut: "L", icon: LassoSelect },
  { value: "brush", label: "Brush", shortcut: "B", icon: Brush },
  { value: "eraser", label: "Eraser", shortcut: "E", icon: Eraser },
  { value: "pan", label: "Pan", shortcut: "H", icon: Hand },
];

export function ToolRail({ collapsed, disabled, onSelectTool, onToggleInspector }: { collapsed: boolean; disabled: boolean; onSelectTool: (tool: Tool) => void; onToggleInspector: () => void }) {
  const tool = useEditorStore((state) => state.tool);
  const hasPendingPaint = useEditorStore((state) => Boolean(state.paintSession));

  return (
    <nav className="flex h-12 items-center border-t border-line bg-[#e9e7df] md:h-auto md:flex-col md:border-r md:border-t-0" aria-label="Canvas tools">
      <div className="flex flex-1 items-center justify-center md:w-full md:flex-none md:flex-col md:py-2" role="radiogroup" aria-label="Selection tool">
        {tools.map(({ value, label, shortcut, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={tool === value}
            aria-label={label}
            title={`${label} (${shortcut})`}
            disabled={disabled}
            className={cn(
              "relative grid size-11 place-items-center text-muted outline-none transition-[background-color,color,transform] hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-30",
              tool === value && "bg-ink text-acid hover:bg-ink hover:text-acid",
            )}
            onClick={() => onSelectTool(value)}
          >
            <Icon className="size-[17px]" />
            {value === "brush" && hasPendingPaint && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-acid ring-1 ring-ink" aria-label="Paint pending" />}
            <span className="sr-only">{shortcut}</span>
          </button>
        ))}
      </div>
      {tool !== "pan" && <button
        type="button"
        className="grid size-11 place-items-center text-muted hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={collapsed ? "Open inspector" : "Collapse inspector"}
        title={collapsed ? "Open inspector" : "Collapse inspector"}
        onClick={onToggleInspector}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>}
    </nav>
  );
}
