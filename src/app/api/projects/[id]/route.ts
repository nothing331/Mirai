import { getProject } from "@/server/storage/project-repository";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  return project ? Response.json(project) : Response.json({ error: "Project not found." }, { status: 404 });
}
