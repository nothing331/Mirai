import type { ImageEditProvider } from "./contracts";
import type { EditIntentPlanner } from "./intent-planner";
import { FakeEditIntentPlanner } from "./fake-intent-planner";
import { FakeImageEditProvider } from "./fake-provider";
import { OpenAIEditIntentPlanner } from "./openai-intent-planner";
import { OpenAIImageEditProvider } from "./openai-provider";

export type ProviderName = "fake" | "openai";

/** Selects one server-only provider from environment configuration. */
export function configuredProviderName(): ProviderName {
  return process.env.IMAGE_EDIT_PROVIDER === "openai" ? "openai" : "fake";
}

/** Builds the configured provider without exposing credentials to client code. */
export function createImageEditProvider(): ImageEditProvider {
  if (configuredProviderName() === "fake") return new FakeImageEditProvider();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when IMAGE_EDIT_PROVIDER=openai.");
  const quality = parseQuality(process.env.OPENAI_IMAGE_QUALITY);
  const maxInputEdge = parsePositiveInteger(process.env.OPENAI_IMAGE_MAX_EDGE, 1536);
  return new OpenAIImageEditProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2", quality, maxInputEdge);
}

/** Builds the Replace-only intent planner behind the same server-side credential boundary. */
export function createEditIntentPlanner(): EditIntentPlanner {
  if (configuredProviderName() === "fake") return new FakeEditIntentPlanner();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when IMAGE_EDIT_PROVIDER=openai.");
  return new OpenAIEditIntentPlanner(process.env.OPENAI_API_KEY, configuredPlannerModel());
}

export function configuredPlannerModel(): string {
  return process.env.OPENAI_EDIT_PLANNER_MODEL ?? "gpt-5-nano-2025-08-07";
}

/** Restricts environment input to quality values supported by the image-edit API. */
function parseQuality(value: string | undefined): "low" | "medium" | "high" | "auto" {
  return value === "low" || value === "high" || value === "auto" ? value : "medium";
}

/** Parses positive integer cost controls without allowing invalid configuration through. */
export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
