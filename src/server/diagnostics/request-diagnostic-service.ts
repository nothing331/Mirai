import { randomUUID } from "node:crypto";
import path from "node:path";
import type { DiagnosticArtifactName, ImageEditDiagnosticSink, ProviderCallStage, RequestDiagnosticError, RequestDiagnosticManifest, RequestDiagnosticProviderCall } from "@/shared/request-diagnostics";
import { RequestDiagnosticRepository } from "./request-diagnostic-repository";

export const requestDiagnosticRepository = new RequestDiagnosticRepository();

interface StartRequestDiagnostics {
  projectId: string;
  requestId: string;
  retryOfRequestId: string | null;
  provider: "fake" | "openai";
}

/** Isolates observability failures from the image-edit path they are observing. */
export class RequestDiagnosticSession implements ImageEditDiagnosticSink {
  private constructor(
    private readonly repository: RequestDiagnosticRepository,
    readonly projectId: string,
    readonly requestId: string,
  ) {}

  static async start(input: StartRequestDiagnostics, repository = requestDiagnosticRepository): Promise<RequestDiagnosticSession> {
    const bundlePath = repository.bundlePath(input.projectId, input.requestId);
    const now = new Date().toISOString();
    const manifest: RequestDiagnosticManifest = {
      schemaVersion: 2,
      projectId: input.projectId,
      requestId: input.requestId,
      retryOfRequestId: input.retryOfRequestId,
      providerRequestId: null,
      provider: input.provider,
      operation: null,
      status: "processing",
      pinned: false,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      durationMs: null,
      userPrompt: "",
      plannerInstruction: null,
      editPlan: null,
      providerInstruction: null,
      sourceDimensions: null,
      providerDimensions: null,
      configuration: {},
      retryable: null,
      error: null,
      providerCalls: [],
      events: [{ id: randomUUID(), timestamp: now, stage: "received", level: "info", message: "Image-edit request received." }],
      artifacts: {},
      bundlePath,
    };
    await repository.create(manifest);
    return new RequestDiagnosticSession(repository, input.projectId, input.requestId);
  }

  async event(stage: string, message: string, details?: Record<string, string | number | boolean | null>): Promise<void> {
    await this.safely(`record ${stage}`, () => this.repository.mutate(this.requestId, (manifest) => {
      manifest.events.push({ id: randomUUID(), timestamp: new Date().toISOString(), stage, level: "info", message, details });
    }));
  }

  async artifact(name: DiagnosticArtifactName, bytes: Uint8Array, mediaType: "image/png" | "application/json"): Promise<void> {
    await this.safely(`write ${name}`, () => this.repository.writeArtifact(this.requestId, name, bytes, mediaType));
  }

  async metadata(values: Partial<Pick<RequestDiagnosticManifest, "providerRequestId" | "plannerInstruction" | "editPlan" | "providerInstruction" | "providerDimensions" | "configuration">>): Promise<void> {
    await this.safely("update metadata", () => this.repository.mutate(this.requestId, (manifest) => {
      if (values.providerRequestId !== undefined) manifest.providerRequestId = values.providerRequestId;
      if (values.plannerInstruction !== undefined) manifest.plannerInstruction = values.plannerInstruction;
      if (values.editPlan !== undefined) manifest.editPlan = values.editPlan;
      if (values.providerInstruction !== undefined) manifest.providerInstruction = values.providerInstruction;
      if (values.providerDimensions !== undefined) manifest.providerDimensions = values.providerDimensions;
      if (values.configuration !== undefined) manifest.configuration = { ...manifest.configuration, ...values.configuration };
    }));
  }

  async beginProviderCall(stage: ProviderCallStage, provider: RequestDiagnosticProviderCall["provider"], model: string): Promise<void> {
    await this.safely(`start ${stage}`, () => this.repository.mutate(this.requestId, (manifest) => {
      const startedAt = new Date().toISOString();
      const existing = manifest.providerCalls.findIndex((call) => call.stage === stage);
      const call: RequestDiagnosticProviderCall = {
        stage,
        provider,
        model,
        providerRequestId: null,
        status: "processing",
        startedAt,
        completedAt: null,
        durationMs: null,
        usage: {},
        retryable: null,
        error: null,
      };
      if (existing >= 0) manifest.providerCalls[existing] = call;
      else manifest.providerCalls.push(call);
    }));
  }

  async completeProviderCall(stage: ProviderCallStage, providerRequestId: string | null, usage: RequestDiagnosticProviderCall["usage"] = {}): Promise<void> {
    await this.safely(`complete ${stage}`, () => this.repository.mutate(this.requestId, (manifest) => {
      const call = manifest.providerCalls.find((item) => item.stage === stage);
      if (!call) return;
      const completedAt = new Date();
      call.providerRequestId = providerRequestId;
      call.status = "succeeded";
      call.completedAt = completedAt.toISOString();
      call.durationMs = completedAt.getTime() - new Date(call.startedAt).getTime();
      call.usage = usage;
    }));
  }

  async failProviderCall(stage: ProviderCallStage, error: RequestDiagnosticError, retryable: boolean, providerRequestId: string | null = null): Promise<void> {
    await this.safely(`fail ${stage}`, () => this.repository.mutate(this.requestId, (manifest) => {
      const call = manifest.providerCalls.find((item) => item.stage === stage);
      if (!call) return;
      const completedAt = new Date();
      call.providerRequestId = providerRequestId;
      call.status = "failed";
      call.completedAt = completedAt.toISOString();
      call.durationMs = completedAt.getTime() - new Date(call.startedAt).getTime();
      call.retryable = retryable;
      call.error = error;
    }));
  }

  async requestMetadata(values: Pick<RequestDiagnosticManifest, "operation" | "userPrompt" | "sourceDimensions">): Promise<void> {
    await this.safely("update request metadata", () => this.repository.mutate(this.requestId, (manifest) => {
      Object.assign(manifest, values);
    }));
  }

  async succeed(providerRequestId: string | null): Promise<void> {
    await this.safely("complete request", async () => {
      await this.repository.mutate(this.requestId, (manifest) => {
        const completedAt = new Date();
        manifest.status = "succeeded";
        manifest.providerRequestId = providerRequestId;
        manifest.completedAt = completedAt.toISOString();
        manifest.durationMs = completedAt.getTime() - new Date(manifest.startedAt).getTime();
        manifest.events.push({ id: randomUUID(), timestamp: completedAt.toISOString(), stage: "response-prepared", level: "info", message: "Candidate response prepared for the browser." });
      });
      await this.repository.prune();
    });
  }

  async fail(error: RequestDiagnosticError, retryable: boolean): Promise<void> {
    await this.safely("record request failure", async () => {
      await this.repository.mutate(this.requestId, (manifest) => {
        const completedAt = new Date();
        manifest.status = "failed";
        manifest.completedAt = completedAt.toISOString();
        manifest.durationMs = completedAt.getTime() - new Date(manifest.startedAt).getTime();
        manifest.retryable = retryable;
        manifest.error = error;
        manifest.events.push({ id: randomUUID(), timestamp: completedAt.toISOString(), stage: "failed", level: "error", message: error.message });
      });
      await this.repository.prune();
    });
  }

  private async safely(label: string, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      console.error(`[diagnostics:${this.requestId}] Could not ${label}.`, error);
    }
  }
}

export async function startRequestDiagnostics(input: StartRequestDiagnostics): Promise<RequestDiagnosticSession | null> {
  try {
    return await RequestDiagnosticSession.start(input);
  } catch (error) {
    console.error(`[diagnostics:${input.requestId}] Could not start request diagnostics at ${path.join(".local-edit", "diagnostics")}.`, error);
    return null;
  }
}
