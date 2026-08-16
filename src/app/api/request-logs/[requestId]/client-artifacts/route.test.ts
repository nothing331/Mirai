// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestDiagnosticManifest } from "@/shared/request-diagnostics";

const mocks = vi.hoisted(() => ({ get: vi.fn(), writeArtifact: vi.fn(), mutate: vi.fn() }));

vi.mock("@/server/diagnostics/request-diagnostic-service", () => ({ requestDiagnosticRepository: mocks }));

import { POST } from "./route";

describe("diagnostic client artifact route", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.writeArtifact.mockReset().mockResolvedValue(undefined);
    mocks.mutate.mockReset().mockResolvedValue(undefined);
  });

  it("accepts an Extend preview at the planned output dimensions", async () => {
    mocks.get.mockResolvedValue(manifest("extend"));

    const response = await POST(await previewRequest(4, 6), { params: Promise.resolve({ requestId: "request-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.writeArtifact).toHaveBeenCalledWith("request-1", "final-preview.png", expect.any(Uint8Array), "image/png");
  });

  it("keeps source-dimension validation for non-Extend previews", async () => {
    mocks.get.mockResolvedValue(manifest("transform"));

    const response = await POST(await previewRequest(4, 6), { params: Promise.resolve({ requestId: "request-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.writeArtifact).not.toHaveBeenCalled();
  });
});

async function previewRequest(width: number, height: number) {
  const preview = await sharp({ create: { width, height, channels: 4, background: "red" } }).png().toBuffer();
  const form = new FormData();
  form.set("finalPreview", new File([Uint8Array.from(preview)], "final-preview.png", { type: "image/png" }));
  form.set("boundaryPolicy", "review");
  return new Request("http://localhost/api/request-logs/request-1/client-artifacts", { method: "POST", headers: { "x-project-id": "project-1" }, body: form });
}

function manifest(operation: "extend" | "transform") {
  return {
    projectId: "project-1",
    requestId: "request-1",
    operation,
    boundaryPolicy: "review",
    sourceDimensions: { width: 4, height: 3 },
    providerDimensions: { width: 4, height: 6 },
  } as RequestDiagnosticManifest;
}
