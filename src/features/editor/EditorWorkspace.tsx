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
import { WorkspaceHeader } from "./workspace/WorkspaceHeader";
import { PendingLocalEditDialog } from "./workspace/PendingLocalEditDialog";
import { deriveWorkspacePhase } from "./workspace/workspace-phase";
import type { BusyAction, ExportFormat, ProviderCapabilities, WorkspaceWorkflow } from "./workspace/workspace-types";
import type { GeometryEditType, LocalEditDraft, Tool, TransformInput } from "./types";

type PendingTransition =
  | { kind: "workflow"; workflow: WorkspaceWorkflow }
  | { kind: "geometry"; editType: GeometryEditType };

/** Coordinates project I/O and provider authorization around the editor's domain-owned state. */
export function EditorWorkspace() {
  const editor = useEditorStore(useShallow((state) => ({
    currentVersionId: state.currentVersionId,
    preview: state.preview,
    localDraft: state.localDraft,
    localDraftDirty: state.localDraftDirty,
    paintSession: state.paintSession,
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
    beginLocalDraft: state.beginLocalDraft,
    applyLocalDraft: state.applyLocalDraft,
    discardLocalDraft: state.discardLocalDraft,
    createPreview: state.createPreview,
    requestGenerativePreview: state.requestGenerativePreview,
    requestTransformPreview: state.requestTransformPreview,
    extendState: state.extendState,
    planExtend: state.planExtend,
    generateExtend: state.generateExtend,
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
  const [workflow, setWorkflow] = useState<WorkspaceWorkflow>(() => ({ kind: "canvas", tool: useEditorStore.getState().tool }));
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => !useEditorStore.getState().currentVersionId);
  const phase = deriveWorkspacePhase({ hasImage: Boolean(editor.currentVersionId), preview: editor.preview, generativeState: editor.generativeState, selectionMask: editor.selectionMask });

  const performTransition = useCallback((transition: PendingTransition) => {
    if (transition.kind === "geometry") {
      useEditorStore.getState().beginLocalDraft(transition.editType);
      return;
    }
    const next = transition.workflow;
    if (editor.paintSession && (next.kind !== "canvas" || (next.tool !== "brush" && next.tool !== "eraser"))) {
      editor.setError("Apply or discard the pending paint before switching workflows.");
      return;
    }
    if (next.kind === "canvas") {
      editor.setTool(next.tool);
      setInspectorCollapsed(next.tool === "pan");
    } else {
      setInspectorCollapsed(false);
      const currentDraft = useEditorStore.getState().localDraft;
      if (!currentDraft && next.kind === "size-position") editor.beginLocalDraft("crop");
      if (!currentDraft && next.kind === "text") editor.beginLocalDraft("text");
      if (!currentDraft && next.kind === "watermark") editor.beginLocalDraft("watermark");
    }
    setWorkflow(next);
  }, [editor]);

  const requestTransition = useCallback((transition: PendingTransition) => {
    const state = useEditorStore.getState();
    const draft = state.localDraft;
    const changingDraft = draft && (transition.kind === "geometry"
      ? draft.type !== transition.editType
      : workflow.kind !== transition.workflow.kind);
    if (!draft || !changingDraft) {
      performTransition(transition);
      return;
    }
    if (state.localDraftDirty && localDraftChangesOutput(draft, state.versions.find((version) => version.id === draft.inputVersionId))) {
      setPendingTransition(transition);
      return;
    }
    state.discardLocalDraft();
    performTransition(transition);
  }, [performTransition, workflow.kind]);

  const selectWorkflow = useCallback((next: WorkspaceWorkflow) => requestTransition({ kind: "workflow", workflow: next }), [requestTransition]);
  const selectGeometryEdit = useCallback((editType: GeometryEditType) => requestTransition({ kind: "geometry", editType }), [requestTransition]);

  const selectTool = useCallback((tool: Tool) => selectWorkflow({ kind: "canvas", tool }), [selectWorkflow]);
  const selectTransform = useCallback(() => selectWorkflow({ kind: "transform" }), [selectWorkflow]);
  const selectExtend = useCallback(() => selectWorkflow({ kind: "extend" }), [selectWorkflow]);

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
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        if (phase !== "processing" && phase !== "preview") selectTransform();
        return;
      }
      if (event.key.toLowerCase() === "x") {
        event.preventDefault();
        if (phase !== "processing" && phase !== "preview") selectExtend();
        return;
      }
      const tool = ({ l: "lasso", b: "brush", e: "eraser", h: "pan" } as const)[event.key.toLowerCase() as "l" | "b" | "e" | "h"];
      if (tool) {
        event.preventDefault();
        selectTool(tool);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [editor, phase, selectExtend, selectTool, selectTransform]);

  /** Confirms and counts a paid request before allowing it to reach the real provider. */
  function authorizeProviderRequest(label: string, pipeline: "direct" | "replace-planned" | "transform-validated" | "extend-low"): boolean {
    if (providerCapabilities?.provider !== "openai") return true;
    if (realRequestsUsed >= providerCapabilities.maxRealRequestsPerSession) {
      editor.setError(`The session limit of ${providerCapabilities.maxRealRequestsPerSession} real API requests has been reached.`);
      return false;
    }
    const requestDescription = pipeline === "transform-validated"
      ? "source planning, one paid OpenAI image request, and semantic fidelity validation"
      : pipeline === "extend-low"
        ? "one paid OpenAI image extension request using the approved Smart Reframe plan"
      : pipeline === "replace-planned"
        ? "context planning and, if planning succeeds, one paid OpenAI image request"
        : "one paid OpenAI image request without a planner call";
    const plannerDescription = pipeline === "direct" || pipeline === "extend-low" ? "" : `Vision model: ${providerCapabilities.plannerModel}\n`;
    const quality = pipeline === "extend-low" ? "low" : providerCapabilities.quality;
    const confirmed = window.confirm(`${label} will run ${requestDescription}.\n\n${plannerDescription}Image model: ${providerCapabilities.imageModel}\nQuality: ${quality}\nMaximum input edge: ${providerCapabilities.maxInputEdge}px\nSession usage after confirmation: ${realRequestsUsed + 1}/${providerCapabilities.maxRealRequestsPerSession}`);
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

  async function handleGenerateExtend(): Promise<boolean> {
    if (!authorizeProviderRequest("Generate extension", "extend-low")) return false;
    return editor.generateExtend();
  }

  function handleAdjustTransform() {
    editor.discardPreview();
    selectTransform();
  }

  function handleAdjustExtend() {
    editor.discardPreview();
    selectExtend();
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusyAction("upload");
    editor.setError(null);
    try {
      editor.loadImage(await decodeImage(file));
      setWorkflow({ kind: "canvas", tool: "lasso" });
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
      setWorkflow({ kind: "canvas", tool: "lasso" });
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
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
        <section className={cn(
          "grid h-[calc(100dvh-3.5rem)] min-h-0 grid-rows-[minmax(300px,1fr)_auto] transition-[grid-template-columns] duration-200 ease-out md:grid-rows-1",
          inspectorCollapsed ? "md:grid-cols-[48px_minmax(0,1fr)]" : "md:grid-cols-[256px_minmax(0,1fr)]",
        )}>
          <aside className={cn("order-2 grid min-h-0 bg-paper md:order-1 md:grid-cols-[48px_minmax(0,1fr)]", !inspectorCollapsed && "max-md:grid-rows-[48px_minmax(0,42dvh)]")} aria-label="Editor tools">
            <ToolRail
              collapsed={inspectorCollapsed}
              disabled={!editor.currentVersionId || phase === "processing" || phase === "preview"}
              workflow={workflow}
              onSelectWorkflow={selectWorkflow}
              onToggleInspector={() => setInspectorCollapsed((current) => !current)}
            />
            {!inspectorCollapsed && (
              <div className="min-h-0 border-t border-line md:border-t-0" data-testid="editor-inspector">
                <EditorInspector
                  phase={phase}
                  providerCapabilities={providerCapabilities}
                  realRequestsUsed={realRequestsUsed}
                  workflow={workflow}
                  onSelectGeometryEdit={selectGeometryEdit}
                  onGenerate={() => void handleGeneratePreview()}
                  onGenerateTransform={handleTransformPreview}
                  onPlanExtend={editor.planExtend}
                  onGenerateExtend={handleGenerateExtend}
                  onRetry={handleRetryPreview}
                  onOpenDiagnostics={() => setDiagnosticsOpen(true)}
                />
              </div>
            )}
          </aside>
          <CanvasFrame busyAction={busyAction} onUpload={handleUpload} extendSelected={workflow.kind === "extend"} onAdjustTransform={handleAdjustTransform} onAdjustExtend={handleAdjustExtend} />
        </section>
      </main>
      <DiagnosticsDrawer projectId={editor.projectId} focusRequestId={editor.lastRequestId} open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
      {pendingTransition && editor.localDraft ? (
        <PendingLocalEditDialog
          editName={editor.localDraft.type}
          saveDisabled={!canSaveLocalDraft(editor.localDraft)}
          onSave={() => {
            if (!editor.applyLocalDraft()) return;
            const transition = pendingTransition;
            setPendingTransition(null);
            performTransition(transition);
          }}
          onDiscard={() => {
            editor.discardLocalDraft();
            const transition = pendingTransition;
            setPendingTransition(null);
            performTransition(transition);
          }}
          onStay={() => setPendingTransition(null)}
        />
      ) : null}
    </>
  );
}

function canSaveLocalDraft(draft: LocalEditDraft) {
  if (draft.type === "text") return draft.parameters.content.trim().length > 0;
  if (draft.type === "watermark") return draft.parameters.source === "text" ? draft.parameters.content.trim().length > 0 : Boolean(draft.parameters.overlayAssetId);
  return true;
}

function localDraftChangesOutput(draft: LocalEditDraft, input: { width: number; height: number } | undefined) {
  if (!input) return false;
  if (draft.type === "crop") {
    const rect = draft.parameters.sourceRect;
    return rect.x !== 0 || rect.y !== 0 || rect.width !== input.width || rect.height !== input.height;
  }
  if (draft.type === "resize") return draft.parameters.width !== input.width || draft.parameters.height !== input.height;
  return true;
}
