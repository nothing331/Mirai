import { parsePositiveInteger } from "@/server/ai/provider-factory";
import type { AssetGenerationCapabilities, AssetGenerationProviderName } from "@/shared/asset-generation";
import type { AssetGenerator } from "./contracts";
import { FakeAssetGenerator } from "./fake-provider";
import { OpenAIAssetGenerator } from "./openai-provider";

export function configuredAssetGenerationProvider(): AssetGenerationProviderName {
  return process.env.ASSET_GENERATION_PROVIDER === "openai" ? "openai" : "fake";
}

export function assetGenerationCapabilities(): AssetGenerationCapabilities {
  const provider = configuredAssetGenerationProvider();
  return {
    provider,
    model: provider === "openai" ? (process.env.OPENAI_ASSET_GENERATION_MODEL ?? "gpt-image-2") : "fake-asset-generator",
    quality: "low",
    candidateCount: 1,
    sizes: ["1024x1024", "1536x1024", "1024x1536"],
    nativeTransparency: false,
    maxBatchesPerSession: parsePositiveInteger(process.env.OPENAI_ASSET_MAX_BATCHES_PER_SESSION, 2),
  };
}

export function createAssetGenerator(): AssetGenerator {
  if (configuredAssetGenerationProvider() === "fake") return new FakeAssetGenerator();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when ASSET_GENERATION_PROVIDER=openai.");
  return new OpenAIAssetGenerator(process.env.OPENAI_API_KEY, process.env.OPENAI_ASSET_GENERATION_MODEL ?? "gpt-image-2");
}
