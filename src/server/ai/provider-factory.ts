import type { ImageEditProvider } from "./contracts";
import type { EditIntentPlanner } from "./intent-planner";
import type { TransformPlanner } from "./transform-planner";
import type { TransformValidator } from "./transform-validator";
import { FakeEditIntentPlanner } from "./fake-intent-planner";
import { FakeImageEditProvider } from "./fake-provider";
import { FakeTransformPlanner } from "./fake-transform-planner";
import { FakeTransformValidator } from "./fake-transform-validator";
import { OpenAIEditIntentPlanner } from "./openai-intent-planner";
import { OpenAIImageEditProvider } from "./openai-provider";
import { OpenAITransformPlanner } from "./openai-transform-planner";
import { OpenAITransformValidator } from "./openai-transform-validator";
import type { ExtendPlanner } from "./extend-planner";
import { FakeExtendPlanner } from "./fake-extend-planner";
import { OpenAIExtendPlanner } from "./openai-extend-planner";
import type { ExtendProvider } from "./extend-provider";
import { FakeExtendProvider, OpenAIExtendProvider } from "./extend-provider";

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

export function createTransformPlanner(): TransformPlanner {
  if (configuredProviderName() === "fake") return new FakeTransformPlanner();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when IMAGE_EDIT_PROVIDER=openai.");
  return new OpenAITransformPlanner(process.env.OPENAI_API_KEY, configuredPlannerModel());
}

export function createTransformValidator(): TransformValidator {
  if (configuredProviderName() === "fake") return new FakeTransformValidator();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when IMAGE_EDIT_PROVIDER=openai.");
  return new OpenAITransformValidator(process.env.OPENAI_API_KEY, configuredPlannerModel());
}

export function configuredPlannerModel(): string {
  return process.env.OPENAI_EDIT_PLANNER_MODEL ?? "gpt-5-nano-2025-08-07";
}

export function createExtendPlanner(): ExtendPlanner {
  if (configuredProviderName() === "fake") return new FakeExtendPlanner();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when IMAGE_EDIT_PROVIDER=openai.");
  return new OpenAIExtendPlanner(process.env.OPENAI_API_KEY, process.env.OPENAI_EXTEND_PLANNER_MODEL ?? "gpt-5.6-luna");
}

/** Extend intentionally uses low image quality independently of other edit workflows. */
export function createExtendProvider(): ExtendProvider {
  if (configuredProviderName() === "fake") return new FakeExtendProvider();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when IMAGE_EDIT_PROVIDER=openai.");
  return new OpenAIExtendProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_EXTEND_IMAGE_MODEL ?? "gpt-image-2", parsePositiveInteger(process.env.OPENAI_EXTEND_PROVIDER_MAX_EDGE, 1536));
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
