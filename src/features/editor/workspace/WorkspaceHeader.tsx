"use client";

import { Activity, Copy, Download, FolderOpen, ImagePlus, LoaderCircle, MoreHorizontal, Redo2, RotateCcw, Save, Undo2, WandSparkles } from "lucide-react";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { exportVersion } from "../image-data";
import type { SavedProjectSummary } from "../project-client";
import { getCurrentVersion, useEditorStore } from "../store";
import type { BusyAction, ExportFormat } from "./workspace-types";

const iconButton = "grid size-8 shrink-0 place-items-center text-muted outline-none hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-30";

export function WorkspaceHeader({
  busyAction,
  savedProjects,
  exportFormat,
  onExportFormatChange,
  onUpload,
  onOpen,
  onSave,
  onTransform,
  transformDisabled,
  onOpenDiagnostics,
}: {
  busyAction: BusyAction;
  savedProjects: SavedProjectSummary[];
  exportFormat: ExportFormat;
  onExportFormatChange: (format: ExportFormat) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpen: (projectId: string) => void;
  onSave: () => void;
  onTransform: () => void;
  transformDisabled: boolean;
  onOpenDiagnostics: () => void;
}) {
  const currentVersion = useEditorStore(getCurrentVersion);
  const projectId = useEditorStore((state) => state.projectId);
  const projectName = useEditorStore((state) => state.projectName);
  const lastRequestId = useEditorStore((state) => state.lastRequestId);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const reset = useEditorStore((state) => state.reset);
  const canUndo = useEditorStore((state) => state.canUndo());
  const canRedo = useEditorStore((state) => state.canRedo());
  const disabled = busyAction !== null;

  return (
    <header className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-line bg-paper px-2 sm:gap-3 sm:px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <MiraiMark />
        <div className="mr-1 hidden min-w-0 sm:block">
          <h1 className="truncate text-base font-bold leading-none tracking-[-.035em]">Mirai</h1>
          <p className="mt-1 hidden font-mono text-[8px] uppercase tracking-[.14em] text-muted xl:block">Image workspace</p>
        </div>
        <label className={cn(iconButton, "cursor-pointer")} title={currentVersion ? "Replace image" : "Choose image"}>
          <ImagePlus className="size-4" />
          <span className="sr-only">{currentVersion ? "Replace image" : "Choose image"}</span>
          <input data-testid="file-input" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={onUpload} disabled={disabled} />
        </label>
        <label className="relative hidden min-w-0 items-center md:flex" title="Open saved project">
          <FolderOpen className="pointer-events-none absolute left-2 size-3.5 text-muted" />
          <select aria-label="Open saved project" className="h-8 w-36 min-w-0 appearance-none bg-[#e8e5dc] pl-7 pr-2 text-[10px] outline-none hover:bg-white/70 focus:ring-2 focus:ring-accent lg:w-40" value="" disabled={disabled} onChange={(event) => onOpen(event.target.value)}>
            <option value="">Open project…</option>
            {savedProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex min-w-0 items-center justify-center gap-1.5">
        <input aria-label="Project name" className="h-8 w-28 min-w-0 border-b border-line bg-transparent px-1 text-center text-xs font-semibold outline-none focus:border-accent sm:w-44" value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={!currentVersion || disabled} />
        <button type="button" aria-label="Save" className="flex h-8 items-center gap-1.5 bg-ink px-2.5 text-[10px] font-bold text-paper outline-none hover:bg-acid hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-30" disabled={!currentVersion || disabled} onClick={onSave}>
          {busyAction === "save" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          <span className="hidden sm:inline">Save</span>
        </button>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-0.5">
        <button type="button" data-testid="open-transform" className="mr-1 flex h-8 items-center gap-1.5 bg-acid px-2.5 text-[10px] font-bold text-ink outline-none hover:bg-ink hover:text-acid focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-30" disabled={!currentVersion || disabled || transformDisabled} onClick={onTransform}><WandSparkles className="size-3.5" /><span className="hidden md:inline">Transform</span></button>
        <div className="mr-1 hidden items-center lg:flex">
          <button type="button" data-testid="undo" aria-label="Undo" title="Undo (⌘Z)" className={iconButton} disabled={!canUndo || disabled} onClick={undo}><Undo2 className="size-4" /></button>
          <button type="button" data-testid="redo" aria-label="Redo" title="Redo (⇧⌘Z)" className={iconButton} disabled={!canRedo || disabled} onClick={redo}><Redo2 className="size-4" /></button>
        </div>
        {projectId && <IdChip label="Project" value={projectId} className="hidden xl:flex" />}
        {lastRequestId && <IdChip label="Request" value={lastRequestId} className="hidden 2xl:flex" />}
        <button type="button" aria-label="Diagnostics" title="Diagnostics" className={iconButton} disabled={!projectId} onClick={onOpenDiagnostics}><Activity className="size-4" /></button>
        <select aria-label="Export format" className="hidden h-8 bg-transparent px-1 font-mono text-[9px] text-muted outline-none hover:bg-white/70 focus:ring-2 focus:ring-accent sm:block" value={exportFormat} disabled={!currentVersion} onChange={(event) => onExportFormatChange(event.target.value as ExportFormat)}>
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPEG</option>
        </select>
        <button type="button" aria-label="Export current image" title="Export current image" className={iconButton} disabled={!currentVersion} onClick={() => currentVersion && exportVersion(currentVersion, exportFormat)}><Download className="size-4" /></button>
        <details className="group relative">
          <summary className={cn(iconButton, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")} aria-label="More editor actions" title="More editor actions"><MoreHorizontal className="size-4" /></summary>
          <div className="absolute right-0 top-10 z-40 grid w-48 bg-paper py-1 shadow-[0_12px_35px_rgba(0,0,0,.22)] ring-1 ring-ink/15">
            <button type="button" className="flex h-9 items-center gap-2 px-3 text-left text-xs hover:bg-white/70 disabled:opacity-35 lg:hidden" disabled={!canUndo} onClick={undo}><Undo2 className="size-3.5" />Undo</button>
            <button type="button" className="flex h-9 items-center gap-2 px-3 text-left text-xs hover:bg-white/70 disabled:opacity-35 lg:hidden" disabled={!canRedo} onClick={redo}><Redo2 className="size-3.5" />Redo</button>
            <button type="button" className="flex h-9 items-center gap-2 px-3 text-left text-xs hover:bg-[#ffd5cc] disabled:opacity-35" disabled={!currentVersion} onClick={reset}><RotateCcw className="size-3.5" />Reset to original</button>
          </div>
        </details>
      </div>
    </header>
  );
}

function MiraiMark() {
  return (
    <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden bg-ink text-acid" aria-hidden="true">
      <svg viewBox="0 0 32 32" className="size-7" fill="none">
        <path d="M7 23V9l9 9 9-9v14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" />
        <path d="M22.5 5.5v5M20 8h5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

function IdChip({ label, value, className }: { label: string; value: string; className?: string }) {
  const compact = `${value.slice(0, 6)}…`;
  return (
    <button type="button" className={cn("group min-w-0 items-center gap-1 bg-[#e8e5dc] px-2 py-1.5 font-mono hover:bg-white/70", className)} title={`Copy ${label.toLowerCase()} ID: ${value}`} onClick={() => void navigator.clipboard.writeText(value)}>
      <span className="text-[7px] uppercase text-muted">{label}</span><code className="text-[8px] text-ink">{compact}</code><Copy className="size-2.5 opacity-40 group-hover:opacity-100" />
    </button>
  );
}
