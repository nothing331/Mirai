import type { ProjectOrigin } from "@/shared/asset-generation";
import { decodeImage, decodeOverlayImage } from "./image-data";
import type { EditOperation, ImageVersion, MaskAsset, OverlayImageAsset } from "./types";

export interface SavedProjectSummary { id: string; name: string; updatedAt: string }

export async function listSavedProjects(): Promise<SavedProjectSummary[]> {
  const response = await fetch("/api/projects");
  if (!response.ok) throw new Error("Saved projects could not be loaded.");
  return (await response.json() as { projects: SavedProjectSummary[] }).projects;
}

export async function saveEditorProject(state: { projectId: string | null; projectName: string; projectOrigin: ProjectOrigin; originalVersionId: string | null; currentVersionId: string | null; versions: ImageVersion[]; operations: EditOperation[]; maskAssets: MaskAsset[]; overlayAssets: OverlayImageAsset[] }) {
  if (!state.projectId || !state.originalVersionId || !state.currentVersionId) throw new Error("Open an image before saving.");
  const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    id: state.projectId, name: state.projectName.trim() || "Untitled edit", origin: state.projectOrigin, originalVersionId: state.originalVersionId, currentVersionId: state.currentVersionId,
    versions: state.versions.map((version) => ({ id: version.id, parentVersionId: version.parentVersionId, width: version.width, height: version.height, mediaType: version.mediaType, dataUrl: version.dataUrl })), operations: state.operations,
    maskAssets: state.maskAssets.map((mask) => ({ id: mask.id, width: mask.width, height: mask.height, alpha: Array.from(mask.data) })), updatedAt: new Date().toISOString(),
    overlayAssets: state.overlayAssets.map((asset) => ({ id: asset.id, width: asset.width, height: asset.height, mediaType: asset.mediaType, dataUrl: asset.dataUrl, originalName: asset.originalName })),
  }) });
  if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "The project could not be saved.");
}

export async function openSavedProject(id: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("The saved project could not be opened.");
  const project = await response.json() as { id: string; name: string; origin?: ProjectOrigin; originalVersionId: string; currentVersionId: string; versions: Array<Omit<ImageVersion, "pixels">>; operations: EditOperation[]; maskAssets: Array<{ id: string; width: number; height: number; alpha: number[] }>; overlayAssets?: Array<Omit<OverlayImageAsset, "pixels">> };
  const versions = await Promise.all(project.versions.map(async (saved) => {
    const blob = await fetch(saved.dataUrl).then((result) => result.blob());
    const decoded = await decodeImage(new File([blob], "version", { type: saved.mediaType }));
    return { ...decoded, ...saved };
  }));
  const overlayAssets = await Promise.all((project.overlayAssets ?? []).map(async (saved) => {
    const blob = await fetch(saved.dataUrl).then((result) => result.blob());
    const decoded = await decodeOverlayImage(new File([blob], saved.originalName, { type: "image/png" }));
    return { ...decoded, ...saved };
  }));
  return { ...project, versions, overlayAssets, maskAssets: project.maskAssets.map((mask) => ({ id: mask.id, width: mask.width, height: mask.height, data: new Uint8ClampedArray(mask.alpha) })) };
}
