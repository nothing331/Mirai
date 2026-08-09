import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";

export interface ProjectSnapshot {
  id: string;
  name: string;
  originalVersionId: string;
  currentVersionId: string;
  versions: Array<{ id: string; parentVersionId: string | null; width: number; height: number; mediaType: "image/png" | "image/jpeg"; dataUrl: string }>;
  operations: unknown[];
  maskAssets: Array<{ id: string; width: number; height: number; alpha: number[] }>;
  overlayAssets?: Array<{ id: string; width: number; height: number; mediaType: "image/png"; dataUrl: string; originalName: string }>;
  updatedAt: string;
}

const root = path.join(process.cwd(), ".local-edit");
const databasePath = path.join(root, "projects.sqlite");
let queue = Promise.resolve();

async function openDatabase(): Promise<Database> {
  await mkdir(root, { recursive: true });
  const SQL = await initSqlJs({ locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file) });
  let bytes: Uint8Array | undefined;
  try { bytes = new Uint8Array(await readFile(databasePath)); } catch { bytes = undefined; }
  const database = bytes ? new SQL.Database(bytes) : new SQL.Database();
  database.run("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, snapshot TEXT NOT NULL, updated_at TEXT NOT NULL)");
  return database;
}

async function persist(database: Database) {
  const temporaryPath = `${databasePath}.tmp`;
  await writeFile(temporaryPath, database.export());
  await rename(temporaryPath, databasePath);
}

async function persistImmutableAssets(snapshot: ProjectSnapshot) {
  const projectRoot = path.join(root, "assets", snapshot.id);
  await mkdir(projectRoot, { recursive: true });
  await Promise.all(snapshot.versions.map(async (version) => {
    const base64 = version.dataUrl.split(",")[1];
    if (!base64) throw new Error(`Version ${version.id} has no encoded image data.`);
    const extension = version.mediaType === "image/jpeg" ? "jpg" : "png";
    try { await writeFile(path.join(projectRoot, `${version.id}.${extension}`), Buffer.from(base64, "base64"), { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }));
  await Promise.all(snapshot.maskAssets.map(async (mask) => {
    try { await writeFile(path.join(projectRoot, `${mask.id}.mask`), Uint8Array.from(mask.alpha), { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }));
  await Promise.all((snapshot.overlayAssets ?? []).map(async (asset) => {
    const base64 = asset.dataUrl.split(",")[1];
    if (!base64) throw new Error(`Overlay ${asset.id} has no encoded image data.`);
    try { await writeFile(path.join(projectRoot, `${asset.id}.overlay.png`), Buffer.from(base64, "base64"), { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }));
}

export async function saveProject(snapshot: ProjectSnapshot): Promise<void> {
  queue = queue.then(async () => {
    await persistImmutableAssets(snapshot);
    const database = await openDatabase();
    try {
      database.run("INSERT INTO projects (id, name, snapshot, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, snapshot=excluded.snapshot, updated_at=excluded.updated_at", [snapshot.id, snapshot.name, JSON.stringify(snapshot), snapshot.updatedAt]);
      await persist(database);
    } finally { database.close(); }
  });
  await queue;
}

export async function getProject(id: string): Promise<ProjectSnapshot | null> {
  await queue;
  const database = await openDatabase();
  try {
    const statement = database.prepare("SELECT snapshot FROM projects WHERE id = ?");
    statement.bind([id]);
    if (!statement.step()) return null;
    return JSON.parse(String(statement.getAsObject().snapshot)) as ProjectSnapshot;
  } finally { database.close(); }
}

export async function listProjects(): Promise<Array<Pick<ProjectSnapshot, "id" | "name" | "updatedAt">>> {
  await queue;
  const database = await openDatabase();
  try {
    const results = database.exec("SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC");
    if (!results[0]) return [];
    return results[0].values.map(([id, name, updatedAt]) => ({ id: String(id), name: String(name), updatedAt: String(updatedAt) }));
  } finally { database.close(); }
}
