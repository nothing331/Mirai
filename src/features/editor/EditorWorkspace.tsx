"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { DiagnosticsDrawer } from "@/features/diagnostics/DiagnosticsDrawer";
import { cn } from "@/lib/utils";
import { decodeImage } from "./image-data";
import { maskHasSelection } from "./mask";
import { listSavedProjects, openSavedProject, saveEditorProject, type SavedProjectSummary } from "./project-client";
import { useEditorStore } from "./store";
import { CanvasFrame } from "./workspace/CanvasFrame";
import { EditorInspector } from "./workspace/EditorInspector";
import { ToolRail } from "./workspace/ToolRail";
import { TransformDialog } from "./workspace/TransformDialog";
import { WorkspaceHeader } from "./workspace/WorkspaceHeader";
import { deriveWorkspacePhase } from "./workspace/workspace-phase";
import type { BusyAction, ExportFormat, ProviderCapabilities } from "./workspace/workspace-types";
import type { Tool, TransformInput } from "./types";

/** Coordinates project I/O and provider authorization around the editor's domain-owned state. */
export function EditorWorkspace() {
  const editor = useEditorStore(useShallow((state) => ({
    currentVersionId: state.currentVersionId,
    preview: state.preview,
    generativeState: state.generativeState,
    selectionMask: state.selectionMask,
    editType: state.editType,
    prompt: state.prompt,
    projectId: state.projectId,
    lastRequestId: state.lastRequestId,
    loadImage: state.loadImage,
    restoreProject: state.restoreProject,
    setTool: state.setTool,
    setError: state.setError,
    createPreview: state.createPreview,
    requestGenerativePreview: state.requestGenerativePreview,
    requestTransformPreview: state.requestTransformPreview,
    retryGenerativePreview: state.retryGenerativePreview,
    discardPreview: state.discardPreview,
    undo: state.undo,
    redo: state.redo,
  })));
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapabilities | null>(null);
  const [realRequestsUsed, setRealRequestsUsed] = useState(0);
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("image/png");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [transformOpen, setTransformOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => !useEditorStore.getState().currentVersionId);
  const phase = deriveWorkspacePhase({ hasImage: Boolean(editor.currentVersionId), preview: editor.preview, generativeState: editor.generativeState, selectionMask: editor.selectionMask });

  const selectTool = useCallback((tool: Tool) => {
    editor.setTool(tool);
    setInspectorCollapsed(tool === "pan");
  }, [editor]);

  useEffect(() => {
    fetch("/api/image-edits").then((response) => response.json()).then((capabilities: ProviderCapabilities) => setProviderCapabilities(capabilities)).catch(() => setProviderCapabilities(null));
    listSavedProjects().then(setSavedProjects).catch(() => setSavedProjects([]));
    const restoreUsage = window.setTimeout(() => {
      const storedUsage = Number.parseInt(sessionStorage.getItem("local-edit-real-requests") ?? "0", 10);
      if (Number.isFinite(storedUsage) && storedUsage > 0) setRealRequestsUsed(storedUsage);
    }, 0);
    return () => window.clearTimeout(restoreUsage);
  }, []);

  useEffect(() => {
    const releaseUnusedGeneration = () => {
      setRealRequestsUsed((current) => {
        const nextUsage = Math.max(0, current - 1);
        sessionStorage.setItem("local-edit-real-requests", String(nextUsage));
        return nextUsage;
      });
    };
    window.addEventListener("image-generation-skipped", releaseUnusedGeneration);
    return () => window.removeEventListener("image-generation-skipped", releaseUnusedGeneration);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (!editor.currentVersionId || event.metaKey || event.ctrlKey || event.altKey) return;
      const tool = ({ l: "lasso", b: "brush", e: "eraser", h: "pan" } as const)[event.key.toLowerCase() as "l" | "b" | "e" | "h"];
      if (tool) {
        event.preventDefault();
        selectTool(tool);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [editor, selectTool]);

  /** Confirms and counts a paid request before allowing it to reach the real provider. */
  function authorizeProviderRequest(label: string, pipeline: "direct" | "replace-planned" | "transform-validated"): boolean {
    if (providerCapabilities?.provider !== "openai") return true;
    if (realRequestsUsed >= providerCapabilities.maxRealRequestsPerSession) {
      editor.setError(`The session limit of ${providerCapabilities.maxRealRequestsPerSession} real API requests has been reached.`);
      return false;
    }
    const requestDescription = pipeline === "transform-validated"
      ? "source planning, one paid OpenAI image request, and semantic fidelity validation"
      : pipeline === "replace-planned"
        ? "context planning and, if planning succeeds, one paid OpenAI image request"
        : "one paid OpenAI image request without a planner call";
    const plannerDescription = pipeline === "direct" ? "" : `Vision model: ${providerCapabilities.plannerModel}\n`;
    const confirmed = window.confirm(`${label} will run ${requestDescription}.\n\n${plannerDescription}Image model: ${providerCapabilities.imageModel}\nQuality: ${providerCapabilities.quality}\nMaximum input edge: ${providerCapabilities.maxInputEdge}px\nSession usage after confirmation: ${realRequestsUsed + 1}/${providerCapabilities.maxRealRequestsPerSession}`);
    if (confirmed) {
      const nextUsage = realRequestsUsed + 1;
      setRealRequestsUsed(nextUsage);
      sessionStorage.setItem("local-edit-real-requests", String(nextUsage));
    }
    return confirmed;
  }

  async function handleGeneratePreview() {
    if (editor.editType === "recolor") {
      editor.createPreview();
      return;
    }
    const ready = editor.selectionMask && maskHasSelection(editor.selectionMask) && (editor.editType === "remove" || editor.prompt.trim().length > 0);
    if (!ready || authorizeProviderRequest("Generate preview", editor.editType === "replace" ? "replace-planned" : "direct")) await editor.requestGenerativePreview();
  }

  async function handleRetryPreview(): Promise<boolean> {
    const operation = editor.generativeState.snapshot?.operation;
    const pipeline = operation === "transform" ? "transform-validated" : operation === "replace" ? "replace-planned" : "direct";
    if (!authorizeProviderRequest("Retry preview", pipeline)) return false;
    return editor.retryGenerativePreview();
  }

  async function handleTransformPreview(input: TransformInput): Promise<boolean> {
    const localMonochrome = input.presetId === "monochrome" && input.userPrompt.trim().length === 0;
    if (!localMonochrome && !authorizeProviderRequest("Generate transformation", "transform-validated")) return false;
    return editor.requestTransformPreview(input);
  }

  function handleAdjustTransform() {
    editor.discardPreview();
    setTransformOpen(true);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusyAction("upload");
    editor.setError(null);
    try {
      editor.loadImage(await decodeImage(file));
      setInspectorCollapsed(false);
      setRealRequestsUsed(0);
      sessionStorage.removeItem("local-edit-real-requests");
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : "The image could not be opened.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSave() {
    setBusyAction("save");
    try {
      await saveEditorProject(useEditorStore.getState());
      setSavedProjects(await listSavedProjects());
      editor.setError(null);
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : "The project could not be saved.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOpen(id: string) {
    if (!id) return;
    setBusyAction("open");
    try {
      editor.restoreProject(await openSavedProject(id));
      setInspectorCollapsed(false);
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : "The project could not be opened.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <main className="h-dvh overflow-hidden bg-[#cfcdc5] text-ink">
        <WorkspaceHeader
          busyAction={busyAction}
          savedProjects={savedProjects}
          exportFormat={exportFormat}
          onExportFormatChange={setExportFormat}
          onUpload={handleUpload}
          onOpen={(projectId) => void handleOpen(projectId)}
          onSave={() => void handleSave()}
          onTransform={() => setTransformOpen(true)}
          transformDisabled={phase === "processing" || phase === "preview"}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
        <section className={cn(
          "grid h-[calc(100dvh-3.5rem)] min-h-0 grid-rows-[minmax(300px,1fr)_auto] transition-[grid-template-columns] duration-200 ease-out md:grid-rows-1",
          inspectorCollapsed ? "md:grid-cols-[48px_minmax(0,1fr)]" : "md:grid-cols-[256px_minmax(0,1fr)]",
        )}>
          <aside className={cn("order-2 grid min-h-0 overflow-hidden bg-paper md:order-1 md:grid-cols-[48px_minmax(0,1fr)]", !inspectorCollapsed && "max-md:grid-rows-[48px_minmax(0,42dvh)]")} aria-label="Editor tools">
            <ToolRail collapsed={inspectorCollapsed} disabled={!editor.currentVersionId || phase === "processing" || phase === "preview"} onSelectTool={selectTool} onToggleInspector={() => setInspectorCollapsed((current) => !current)} />
            {!inspectorCollapsed && (
              <div className="min-h-0 border-t border-line md:border-t-0" data-testid="editor-inspector">
                <EditorInspector
                  phase={phase}
                  providerCapabilities={providerCapabilities}
                  realRequestsUsed={realRequestsUsed}
                  onGenerate={() => void handleGeneratePreview()}
                  onRetry={() => void handleRetryPreview()}
                  onOpenDiagnostics={() => setDiagnosticsOpen(true)}
                />
              </div>
            )}
          </aside>
          <CanvasFrame busyAction={busyAction} onUpload={handleUpload} onAdjustTransform={handleAdjustTransform} />
        </section>
      </main>
      <TransformDialog
        open={transformOpen}
        providerCapabilities={providerCapabilities}
        realRequestsUsed={realRequestsUsed}
        onClose={() => setTransformOpen(false)}
        onGenerate={handleTransformPreview}
        onRetry={handleRetryPreview}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
      />
      <DiagnosticsDrawer projectId={editor.projectId} focusRequestId={editor.lastRequestId} open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
    </>
  );
}
