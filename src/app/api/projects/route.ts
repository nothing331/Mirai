import { listProjects, saveProject, type ProjectSnapshot } from "@/server/storage/project-repository";

export const runtime = "nodejs";

export async function GET() { return Response.json({ projects: await listProjects() }); }

export async function POST(request: Request) {
  const snapshot = await request.json() as ProjectSnapshot;
  if (!snapshot.id || !snapshot.name || !snapshot.originalVersionId || !snapshot.currentVersionId || !Array.isArray(snapshot.versions)) {
    return Response.json({ error: "The project snapshot is incomplete." }, { status: 400 });
  }
  await saveProject({ ...snapshot, updatedAt: new Date().toISOString() });
  return Response.json({ id: snapshot.id });
}
