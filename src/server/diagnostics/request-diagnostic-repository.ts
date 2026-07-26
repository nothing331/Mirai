import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { diagnosticArtifactNames } from "../../shared/request-diagnostics";
import type { DiagnosticArtifactName, RequestDiagnosticArtifact, RequestDiagnosticManifest, RequestDiagnosticStatus, RequestDiagnosticSummary } from "../../shared/request-diagnostics";

const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const retainedUnpinnedBundles = 10;

export class RequestDiagnosticRepository {
  private queue = Promise.resolve();
  private readonly diagnosticsRoot: string;
  private readonly databasePath: string;

  constructor(private readonly localRoot = path.join(process.cwd(), ".local-edit")) {
    this.diagnosticsRoot = path.join(localRoot, "diagnostics");
    this.databasePath = path.join(this.diagnosticsRoot, "index.sqlite");
  }

  bundlePath(projectId: string, requestId: string): string {
    assertIdentifier(projectId);
    assertIdentifier(requestId);
    return path.join(this.diagnosticsRoot, projectId, requestId);
  }

  async create(manifest: RequestDiagnosticManifest): Promise<void> {
    await this.enqueue(async () => {
      await mkdir(manifest.bundlePath, { recursive: true });
      await this.writeManifest(manifest);
      const database = await this.openDatabase();
      try {
        database.run(
          "INSERT INTO request_diagnostics (request_id, project_id, status, pinned, started_at, updated_at, manifest_path) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [manifest.requestId, manifest.projectId, manifest.status, 0, manifest.startedAt, manifest.updatedAt, path.join(manifest.bundlePath, "manifest.json")],
        );
        await this.persistDatabase(database);
      } finally {
        database.close();
      }
    });
  }

  async mutate(requestId: string, mutate: (manifest: RequestDiagnosticManifest) => void): Promise<RequestDiagnosticManifest> {
    assertIdentifier(requestId);
    return this.enqueue(async () => {
      const manifest = await this.readByRequestId(requestId);
      if (!manifest) throw new Error(`Diagnostic request ${requestId} was not found.`);
      mutate(manifest);
      manifest.updatedAt = new Date().toISOString();
      await this.writeManifest(manifest);
      await this.updateIndex(manifest);
      return manifest;
    });
  }

  async writeArtifact(requestId: string, name: DiagnosticArtifactName, bytes: Uint8Array, mediaType: RequestDiagnosticArtifact["mediaType"]): Promise<RequestDiagnosticManifest> {
    if (!diagnosticArtifactNames.includes(name)) throw new Error(`Unsupported diagnostic artifact: ${name}`);
    return this.enqueue(async () => {
      const manifest = await this.readByRequestId(requestId);
      if (!manifest) throw new Error(`Diagnostic request ${requestId} was not found.`);
      const target = path.join(manifest.bundlePath, name);
      const temporary = `${target}.${randomUUID()}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, target);
      manifest.artifacts[name] = {
        name,
        mediaType,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      manifest.updatedAt = new Date().toISOString();
      await this.writeManifest(manifest);
      await this.updateIndex(manifest);
      return manifest;
    });
  }

  async get(requestId: string): Promise<RequestDiagnosticManifest | null> {
    assertIdentifier(requestId);
    await this.queue.catch(() => undefined);
    return this.readByRequestId(requestId);
  }

  async list(filters: { projectId?: string; status?: RequestDiagnosticStatus; limit?: number }): Promise<RequestDiagnosticSummary[]> {
    if (filters.projectId) assertIdentifier(filters.projectId);
    await this.queue.catch(() => undefined);
    const database = await this.openDatabase();
    try {
      const clauses: string[] = [];
      const values: Array<string | number> = [];
      if (filters.projectId) {
        clauses.push("project_id = ?");
        values.push(filters.projectId);
      }
      if (filters.status) {
        clauses.push("status = ?");
        values.push(filters.status);
      }
      const requestedLimit = filters.limit ?? 50;
      const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
      const sql = `SELECT manifest_path FROM request_diagnostics ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`;
      values.push(limit);
      const statement = database.prepare(sql);
      statement.bind(values);
      const summaries: RequestDiagnosticSummary[] = [];
      while (statement.step()) {
        const manifestPath = String(statement.getAsObject().manifest_path);
        try {
          const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RequestDiagnosticManifest;
          summaries.push(toSummary(manifest));
        } catch {
          // A partially removed bundle is ignored and cleaned by the next retention pass.
        }
      }
      statement.free();
      return summaries;
    } finally {
      database.close();
    }
  }

  async readArtifact(requestId: string, name: DiagnosticArtifactName): Promise<{ bytes: Uint8Array; mediaType: RequestDiagnosticArtifact["mediaType"] } | null> {
    if (!diagnosticArtifactNames.includes(name)) return null;
    const manifest = await this.get(requestId);
    const artifact = manifest?.artifacts[name];
    if (!manifest || !artifact) return null;
    return { bytes: new Uint8Array(await readFile(path.join(manifest.bundlePath, name))), mediaType: artifact.mediaType };
  }

  async setPinned(requestId: string, pinned: boolean): Promise<RequestDiagnosticManifest> {
    const manifest = await this.mutate(requestId, (current) => {
      current.pinned = pinned;
    });
    if (!pinned) await this.prune();
    return manifest;
  }

  async prune(): Promise<void> {
    await this.enqueue(async () => {
      const database = await this.openDatabase();
      try {
        const results = database.exec(
          `SELECT request_id, manifest_path FROM request_diagnostics WHERE pinned = 0 AND status != 'processing' ORDER BY updated_at DESC LIMIT -1 OFFSET ${retainedUnpinnedBundles}`,
        );
        for (const [requestId, manifestPath] of results[0]?.values ?? []) {
          const bundle = path.dirname(String(manifestPath));
          if (bundle.startsWith(`${this.diagnosticsRoot}${path.sep}`)) await rm(bundle, { recursive: true, force: true });
          database.run("DELETE FROM request_diagnostics WHERE request_id = ?", [String(requestId)]);
        }
        await this.persistDatabase(database);
      } finally {
        database.close();
      }
    });
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => undefined).then(task);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async openDatabase(): Promise<Database> {
    await mkdir(this.diagnosticsRoot, { recursive: true });
    const SQL = await initSqlJs({ locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file) });
    let bytes: Uint8Array | undefined;
    try {
      bytes = new Uint8Array(await readFile(this.databasePath));
    } catch {
      bytes = undefined;
    }
    const database = bytes ? new SQL.Database(bytes) : new SQL.Database();
    database.run("CREATE TABLE IF NOT EXISTS request_diagnostics (request_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, manifest_path TEXT NOT NULL)");
    database.run("CREATE INDEX IF NOT EXISTS request_diagnostics_project_updated ON request_diagnostics (project_id, updated_at DESC)");
    database.run("CREATE INDEX IF NOT EXISTS request_diagnostics_status_updated ON request_diagnostics (status, updated_at DESC)");
    return database;
  }

  private async persistDatabase(database: Database): Promise<void> {
    const temporary = `${this.databasePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, database.export());
    await rename(temporary, this.databasePath);
  }

  private async writeManifest(manifest: RequestDiagnosticManifest): Promise<void> {
    const target = path.join(manifest.bundlePath, "manifest.json");
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  private async readByRequestId(requestId: string): Promise<RequestDiagnosticManifest | null> {
    const database = await this.openDatabase();
    try {
      const statement = database.prepare("SELECT manifest_path FROM request_diagnostics WHERE request_id = ?");
      statement.bind([requestId]);
      if (!statement.step()) {
        statement.free();
        return null;
      }
      const manifestPath = String(statement.getAsObject().manifest_path);
      statement.free();
      return JSON.parse(await readFile(manifestPath, "utf8")) as RequestDiagnosticManifest;
    } finally {
      database.close();
    }
  }

  private async updateIndex(manifest: RequestDiagnosticManifest): Promise<void> {
    const database = await this.openDatabase();
    try {
      database.run("UPDATE request_diagnostics SET status = ?, pinned = ?, updated_at = ? WHERE request_id = ?", [
        manifest.status, manifest.pinned ? 1 : 0, manifest.updatedAt, manifest.requestId,
      ]);
      await this.persistDatabase(database);
    } finally {
      database.close();
    }
  }
}

function assertIdentifier(value: string): void {
  if (!identifierPattern.test(value)) throw new Error(`Unsafe diagnostic identifier: ${value}`);
}

function toSummary(manifest: RequestDiagnosticManifest): RequestDiagnosticSummary {
  return {
    projectId: manifest.projectId,
    requestId: manifest.requestId,
    retryOfRequestId: manifest.retryOfRequestId,
    providerRequestId: manifest.providerRequestId,
    provider: manifest.provider,
    operation: manifest.operation,
    status: manifest.status,
    pinned: manifest.pinned,
    startedAt: manifest.startedAt,
    updatedAt: manifest.updatedAt,
    completedAt: manifest.completedAt,
    durationMs: manifest.durationMs,
    retryable: manifest.retryable,
    error: manifest.error,
    bundlePath: manifest.bundlePath,
    artifactNames: Object.keys(manifest.artifacts) as DiagnosticArtifactName[],
  };
}
