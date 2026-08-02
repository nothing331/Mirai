// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeDiagnosticManifest, RequestDiagnosticRepository } from "./request-diagnostic-repository";
import { RequestDiagnosticSession } from "./request-diagnostic-service";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), "mirai-diagnostics-"));
  temporaryRoots.push(root);
  return new RequestDiagnosticRepository(root);
}

describe("request diagnostic repository", () => {
  it("persists ordered events, artifact integrity, request metadata, and a failure", async () => {
    const storage = await repository();
    const session = await RequestDiagnosticSession.start({
      projectId: "project-1",
      requestId: "request-1",
      retryOfRequestId: null,
      provider: "fake",
    }, storage);
    await session.requestMetadata({
      operation: "replace",
      userPrompt: "add a copper sphere",
      sourceDimensions: { width: 20, height: 10 },
    });
    await session.event("validated", "Validated exact dimensions.", { width: 20, height: 10 });
    await session.beginProviderCall("intent-planner", "fake", "fake-intent-planner");
    await session.completeProviderCall("intent-planner", "fake-planner-1", { inputTokens: 12 });
    await session.artifact("source-input.png", new Uint8Array([1, 2, 3, 4]), "image/png");
    await session.fail({ name: "ImageProviderError", message: "Provider rejected the request.", providerStatus: 400 }, false);

    const manifest = await storage.get("request-1");
    expect(manifest).toMatchObject({
      projectId: "project-1",
      status: "failed",
      operation: "replace",
      userPrompt: "add a copper sphere",
      sourceDimensions: { width: 20, height: 10 },
      retryable: false,
      providerCalls: [expect.objectContaining({
        stage: "intent-planner",
        providerRequestId: "fake-planner-1",
        status: "succeeded",
        usage: { inputTokens: 12 },
      })],
    });
    expect(manifest?.events.map((event) => event.stage)).toEqual(["received", "validated", "failed"]);
    expect(manifest?.artifacts["source-input.png"]).toMatchObject({
      bytes: 4,
      sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
    });
    const serialized = await readFile(path.join(manifest!.bundlePath, "manifest.json"), "utf8");
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("OPENAI_API_KEY");
  });

  it("normalizes schema-v1 manifests without inventing provider calls", () => {
    const manifest = normalizeDiagnosticManifest({
      schemaVersion: 1,
      projectId: "project-old",
      requestId: "request-old",
      providerRequestId: "provider-old",
      artifacts: {},
    });
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      plannerInstruction: null,
      editPlan: null,
      providerCalls: [],
    });
  });

  it("keeps ten recent unpinned bundles globally and never prunes pinned evidence", async () => {
    const storage = await repository();
    for (let index = 0; index < 12; index += 1) {
      const requestId = `request-${String(index).padStart(2, "0")}`;
      const session = await RequestDiagnosticSession.start({
        projectId: index % 2 === 0 ? "project-a" : "project-b",
        requestId,
        retryOfRequestId: index === 11 ? "request-10" : null,
        provider: "fake",
      }, storage);
      if (index === 0) await storage.setPinned(requestId, true);
      await session.succeed(`fake-${index}`);
    }

    const requests = await storage.list({ limit: 100 });
    expect(requests).toHaveLength(11);
    expect(requests.some((request) => request.requestId === "request-00" && request.pinned)).toBe(true);
    expect(requests.some((request) => request.requestId === "request-01")).toBe(false);
    expect(requests.find((request) => request.requestId === "request-11")?.retryOfRequestId).toBe("request-10");
  });

  it("filters diagnostics by project and terminal status", async () => {
    const storage = await repository();
    const success = await RequestDiagnosticSession.start({ projectId: "project-a", requestId: "success", retryOfRequestId: null, provider: "fake" }, storage);
    await success.succeed("fake-success");
    const failure = await RequestDiagnosticSession.start({ projectId: "project-b", requestId: "failure", retryOfRequestId: null, provider: "fake" }, storage);
    await failure.fail({ name: "Error", message: "failed" }, true);

    expect((await storage.list({ projectId: "project-a" })).map((request) => request.requestId)).toEqual(["success"]);
    expect((await storage.list({ status: "failed" })).map((request) => request.requestId)).toEqual(["failure"]);
  });

  it("does not leak a repository failure back into the observed request", async () => {
    const storage = await repository();
    const session = await RequestDiagnosticSession.start({ projectId: "project-a", requestId: "request-safe", retryOfRequestId: null, provider: "fake" }, storage);
    vi.spyOn(storage, "mutate").mockRejectedValueOnce(new Error("disk unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(session.event("provider-call", "Calling provider.")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Could not record provider-call"), expect.any(Error));
    consoleError.mockRestore();
  });
});
