import { z } from "zod";

export const assetTypes = ["icon", "logo-mark"] as const;
export const assetStyles = ["minimal-geometric", "monoline", "flat", "bold", "playful"] as const;
export const assetDetailLevels = ["simple", "balanced", "detailed"] as const;
export const imageTreatments = ["auto", "photograph", "sketch", "watercolor", "digital-art", "three-dimensional", "anime"] as const;
export const imageFormats = ["instagram-post", "instagram-portrait", "story-reel", "youtube-thumbnail"] as const;

export type ImageTreatment = typeof imageTreatments[number];
export type ImageFormat = typeof imageFormats[number];
export type AssetCreationFormat = "square-mark" | ImageFormat;

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
  z.object({
    mode: z.literal("mark"),
    brief: assetGenerationBriefSchema,
    format: z.literal("square-mark"),
  }).strict(),
  z.object({
    mode: z.literal("image"),
    prompt: z.string().trim().min(3, "Describe the image you want to create.").max(2000, "Keep the prompt under 2,000 characters."),
    treatment: z.enum(imageTreatments),
    format: z.enum(imageFormats),
  }).strict(),
]);

export type AssetCreationRequest = z.infer<typeof assetCreationRequestSchema>;
export type AssetCreationMode = AssetCreationRequest["mode"];
export type AssetGenerationProviderName = "fake" | "openai";
export type AssetTransparencyStatus = "clean" | "warning" | "failed";

export interface ImageFormatCapability {
  id: ImageFormat;
  width: number;
  height: number;
}

export interface AssetGenerationCapabilities {
  provider: AssetGenerationProviderName;
  model: string;
  quality: "low";
  candidateCount: 1;
  markSize: { width: 1024; height: 1024 };
  imageFormats: ImageFormatCapability[];
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
  quality: "low";
  mode: AssetCreationMode;
  format: AssetCreationFormat;
  width: number;
  height: number;
  prompt: string;
  candidates: AssetGenerationCandidate[];
  warnings: string[];
  imageGenerationAttempted: boolean;
}

export interface GeneratedProjectOrigin {
  kind: "asset-generation";
  requestId: string;
  creationMode: AssetCreationMode;
  assetType?: AssetGenerationBrief["assetType"];
  description: string;
  style?: AssetGenerationBrief["style"];
  treatment?: ImageTreatment;
  format: AssetCreationFormat;
  width: number;
  height: number;
  colorMode?: AssetGenerationBrief["colorMode"];
  colors: string[];
  provider: AssetGenerationProviderName;
  model: string;
  quality: "low";
}

export type ProjectOrigin = { kind: "upload" } | GeneratedProjectOrigin;
