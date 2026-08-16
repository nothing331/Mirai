"use client";

import { Brush, Crop, Eraser, Expand, Hand, LassoSelect, PanelLeftClose, PanelLeftOpen, Sparkles, Stamp, Type, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "../store";
import type { Tool } from "../types";
import type { WorkspaceWorkflow } from "./workspace-types";

const localCanvasTools: Array<{ value: Tool; label: string; shortcut: string; icon: typeof Brush }> = [
  { value: "brush", label: "Brush", shortcut: "B", icon: Brush },
  { value: "eraser", label: "Eraser", shortcut: "E", icon: Eraser },
  { value: "pan", label: "Hand", shortcut: "H", icon: Hand },
];

const aiWorkflowTools: Array<{ kind: Exclude<WorkspaceWorkflow["kind"], "canvas">; label: string; shortcut: string; icon: typeof Brush; testId: string }> = [
  { kind: "transform", label: "AI Transform", shortcut: "T", icon: WandSparkles, testId: "open-transform" },
  { kind: "extend", label: "AI Extend", shortcut: "X", icon: Expand, testId: "open-extend" },
];

const directWorkflowTools: Array<{ kind: Exclude<WorkspaceWorkflow["kind"], "canvas">; label: string; icon: typeof Brush; testId: string }> = [
  { kind: "size-position", label: "Size & position", icon: Crop, testId: "open-size-position" },
  { kind: "text", label: "Text", icon: Type, testId: "open-text" },
  { kind: "watermark", label: "Watermark", icon: Stamp, testId: "open-watermark" },
];

export function ToolRail({ collapsed, disabled, generationDisabled, workflow, onGenerateAsset, onSelectWorkflow, onToggleInspector }: {
  collapsed: boolean;
  disabled: boolean;
  generationDisabled: boolean;
  workflow: WorkspaceWorkflow;
  onGenerateAsset: () => void;
  onSelectWorkflow: (workflow: WorkspaceWorkflow) => void;
  onToggleInspector: () => void;
}) {
  const hasPendingPaint = useEditorStore((state) => Boolean(state.paintSession));
  const hasPendingLocalDraft = useEditorStore((state) => Boolean(state.localDraft));

  return (
    <nav className="relative z-30 flex h-12 items-center overflow-x-auto overflow-y-hidden border-t border-line bg-[#e9e7df] md:h-auto md:flex-col md:overflow-visible md:border-r md:border-t-0" aria-label="Editor tools">
      <button
        data-testid="rail-asset-generator"
        type="button"
        className="group relative grid size-11 shrink-0 place-items-center bg-acid text-ink outline-none transition-colors hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-35 md:mt-2"
        aria-label="Create with AI"
        title="Create with AI"
        disabled={generationDisabled}
        onClick={onGenerateAsset}
      >
        <Sparkles className="size-[17px]" />
        <span className="absolute bottom-1 right-1 font-mono text-[7px] font-bold uppercase leading-none group-hover:text-white">AI</span>
        <ToolLabel label="Create with AI" />
      </button>
      <div className="flex items-center justify-center md:w-full md:flex-col" role="radiogroup" aria-label="Editor workflows">
        <RailButton variant="ai" testId="open-lasso-edit" label="Lasso edit" shortcut="L" selected={workflow.kind === "canvas" && workflow.tool === "lasso"} disabled={disabled} onClick={() => onSelectWorkflow({ kind: "canvas", tool: "lasso" })}>
          <LassoSelect className="size-[17px]" />
          <AiMarker selected={workflow.kind === "canvas" && workflow.tool === "lasso"} />
        </RailButton>
        {aiWorkflowTools.map(({ kind, label, shortcut, icon: Icon, testId }) => (
          <RailButton key={kind} variant="ai" testId={testId} label={label} shortcut={shortcut} selected={workflow.kind === kind} disabled={disabled} onClick={() => onSelectWorkflow({ kind } as WorkspaceWorkflow)}>
            <Icon className="size-[17px]" />
            <AiMarker selected={workflow.kind === kind} />
          </RailButton>
        ))}
        <span className="mx-1 h-7 w-px shrink-0 bg-line md:mx-0 md:my-2 md:h-px md:w-7" aria-hidden="true" />
        {localCanvasTools.map(({ value, label, shortcut, icon: Icon }) => (
          <RailButton key={value} label={label} shortcut={shortcut} selected={workflow.kind === "canvas" && workflow.tool === value} disabled={disabled} onClick={() => onSelectWorkflow({ kind: "canvas", tool: value })}>
            <Icon className="size-[17px]" />
            {value === "brush" && hasPendingPaint && <PendingDot label="Paint pending" />}
          </RailButton>
        ))}
        <span className="mx-1 h-7 w-px shrink-0 bg-line md:mx-0 md:my-1 md:h-px md:w-7" aria-hidden="true" />
        {directWorkflowTools.map(({ kind, label, icon: Icon, testId }) => (
          <RailButton key={kind} testId={testId} label={label} selected={workflow.kind === kind} disabled={disabled} onClick={() => onSelectWorkflow({ kind } as WorkspaceWorkflow)}>
            <Icon className="size-[17px]" />
            {hasPendingLocalDraft && workflow.kind === kind && <PendingDot label="Local edit pending" />}
          </RailButton>
        ))}
      </div>
      {workflow.kind !== "canvas" || workflow.tool !== "pan" ? <button
        type="button"
        className="group relative ml-auto grid size-11 shrink-0 place-items-center text-muted hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent md:mb-1 md:ml-0 md:mt-1"
        aria-label={collapsed ? "Open inspector" : "Collapse inspector"}
        title={collapsed ? "Open inspector" : "Collapse inspector"}
        onClick={onToggleInspector}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        <ToolLabel label={collapsed ? "Open inspector" : "Collapse inspector"} />
      </button> : null}
    </nav>
  );
}

function RailButton({ label, shortcut, selected, disabled, testId, variant = "standard", onClick, children }: { label: string; shortcut?: string; selected: boolean; disabled: boolean; testId?: string; variant?: "standard" | "ai"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      data-testid={testId}
      disabled={disabled}
      className={cn(
        "group relative grid size-11 shrink-0 place-items-center text-muted outline-none transition-[background-color,color] hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-30 md:mx-auto",
        variant === "ai" && "bg-acid text-ink hover:bg-accent hover:text-white",
        selected && "bg-ink text-acid hover:bg-ink hover:text-acid",
      )}
      onClick={onClick}
    >
      {children}
      <ToolLabel label={label} shortcut={shortcut} />
      {shortcut ? <span className="sr-only">{shortcut}</span> : null}
    </button>
  );
}

function PendingDot({ label }: { label: string }) {
  return <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-acid ring-1 ring-ink" aria-label={label} />;
}

function AiMarker({ selected }: { selected: boolean }) {
  return <span className={cn("absolute bottom-1 right-1 font-mono text-[7px] font-bold uppercase leading-none", selected ? "text-acid group-hover:text-acid" : "group-hover:text-white")}>AI</span>;
}

function ToolLabel({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <span data-tooltip={label} className="pointer-events-none absolute z-50 whitespace-nowrap bg-ink px-2 py-1.5 font-mono text-[8px] uppercase tracking-[.08em] text-paper opacity-0 shadow-[3px_3px_0_rgba(216,244,65,.45)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:bottom-[calc(100%+6px)] max-md:left-1/2 max-md:-translate-x-1/2 md:left-[calc(100%+7px)] md:top-1/2 md:-translate-y-1/2">
      {label}{shortcut ? <span className="ml-1.5 text-acid">{shortcut}</span> : null}
    </span>
  );
}
