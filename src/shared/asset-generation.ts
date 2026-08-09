import { z } from "zod";

export const assetTypes = ["icon", "logo-mark"] as const;
export const assetStyles = ["minimal-geometric", "monoline", "flat", "bold", "playful"] as const;
export const assetDetailLevels = ["simple", "balanced", "detailed"] as const;
export const assetGenerationSizes = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type AssetGenerationSize = typeof assetGenerationSizes[number];

export const assetGenerationBriefSchema = z.object({
  assetType: z.enum(assetTypes),
  description: z.string().trim().min(3, "Describe the icon or logo mark.").max(500, "Keep the description under 500 characters."),
  style: z.enum(assetStyles),
  detail: z.enum(assetDetailLevels),
  colorMode: z.enum(["auto", "custom"]),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use six-digit hex colors.")).max(3),
}).superRefine((brief, context) => {
  if (brief.colorMode === "custom" && brief.colors.length === 0) {
    context.addIssue({ code: "custom", path: ["colors"], message: "Choose at least one custom color." });
  }
});

export type AssetGenerationBrief = z.infer<typeof assetGenerationBriefSchema>;
export const assetCreationRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("mark"), brief: assetGenerationBriefSchema, size: z.literal("1024x1024") }),
  z.object({
    mode: z.literal("image"),
    prompt: z.string().trim().min(3, "Describe the image you want to create.").max(2000, "Keep the prompt under 2,000 characters."),
    size: z.enum(assetGenerationSizes),
  }),
  z.object({
    mode: z.literal("transform"),
    prompt: z.string().trim().min(3, "Describe how the source image should change.").max(2000, "Keep the prompt under 2,000 characters."),
    size: z.enum(assetGenerationSizes),
    source: z.object({
      mimeType: z.enum(["image/png", "image/jpeg"]),
      dataBase64: z.string().min(1, "Choose a source image.").max(28_000_000, "Keep the source image under 20 MB."),
    }),
  }),
]);
export type AssetCreationRequest = z.infer<typeof assetCreationRequestSchema>;
export type AssetCreationMode = AssetCreationRequest["mode"];
export type AssetGenerationProviderName = "fake" | "openai";
export type AssetTransparencyStatus = "clean" | "warning" | "failed";

export interface AssetGenerationCapabilities {
  provider: AssetGenerationProviderName;
  model: string;
  quality: "low";
  candidateCount: 1;
  sizes: AssetGenerationSize[];
  nativeTransparency: false;
  maxBatchesPerSession: number;
}

export interface AssetGenerationCandidate {
  id: string;
  candidateBase64: string;
  width: number;
  height: number;
  transparency?: {
    status: AssetTransparencyStatus;
    confidence: number;
    foregroundRatio: number;
  };
}

export interface AssetGenerationResponse {
  projectId: string;
  requestId: string;
  provider: AssetGenerationProviderName;
  providerRequestId: string;
  model: string;
  quality: "low" | "medium" | "high";
  mode: AssetCreationMode;
  size: AssetGenerationSize;
  prompt: string;
  candidates: AssetGenerationCandidate[];
  warnings: string[];
  imageGenerationAttempted: boolean;
}

export interface GeneratedProjectOrigin {
  kind: "asset-generation";
  requestId: string;
  mode: AssetCreationMode;
  assetType?: AssetGenerationBrief["assetType"];
  description: string;
  style?: AssetGenerationBrief["style"];
  colorMode?: AssetGenerationBrief["colorMode"];
  colors: string[];
  size: AssetGenerationSize;
  provider: AssetGenerationProviderName;
  model: string;
  quality: "low" | "medium" | "high";
}

export type ProjectOrigin = { kind: "upload" } | GeneratedProjectOrigin;
