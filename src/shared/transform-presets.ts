export const transformPresetIds = ["monochrome", "sketch", "old-cartoon", "cinematic", "anime"] as const;

export type TransformPresetId = typeof transformPresetIds[number];
export type TransformPreservationMode = "faithful" | "balanced" | "imaginative";

export interface TransformPreset {
  id: TransformPresetId;
  version: 1;
  label: string;
  description: string;
  swatch: readonly [string, string, string];
  recipe: {
    medium: string;
    characteristics: readonly string[];
    preservation: readonly string[];
    exclusions: readonly string[];
  };
}

export const transformPresets: readonly TransformPreset[] = [
  {
    id: "monochrome",
    version: 1,
    label: "Monochrome",
    description: "Controlled black-and-white tonality",
    swatch: ["#171715", "#77766f", "#efeee8"],
    recipe: {
      medium: "high-quality monochrome photographic treatment",
      characteristics: ["a rich grayscale tonal range", "controlled contrast", "detailed highlights and shadows", "subtle film grain"],
      preservation: ["the recognizable subjects", "the composition", "the original geometry", "the lighting direction"],
      exclusions: ["new objects", "text", "logos", "watermarks"],
    },
  },
  {
    id: "sketch",
    version: 1,
    label: "Sketch",
    description: "Graphite linework on tactile paper",
    swatch: ["#292722", "#a69e8b", "#f1ead8"],
    recipe: {
      medium: "hand-drawn graphite sketch on lightly textured paper",
      characteristics: ["confident pencil contours", "natural cross-hatching", "varied line weight", "hand-rendered tonal shading"],
      preservation: ["subject identity", "pose", "camera angle", "the principal composition"],
      exclusions: ["flat digital edge-filter effects", "unrelated annotations", "text", "watermarks"],
    },
  },
  {
    id: "old-cartoon",
    version: 1,
    label: "Old Cartoon",
    description: "Vintage ink-and-paint animation",
    swatch: ["#38271d", "#c9603a", "#e5c86c"],
    recipe: {
      medium: "vintage hand-inked and hand-painted cartoon animation",
      characteristics: ["expressive rounded forms", "bold organic outlines", "a limited aged color palette", "simple painted shading", "subtle film texture"],
      preservation: ["recognizable subjects", "poses", "the scene layout", "the main visual relationships"],
      exclusions: ["specific copyrighted characters", "modern 3D rendering", "logos", "text", "watermarks"],
    },
  },
  {
    id: "cinematic",
    version: 1,
    label: "Cinematic",
    description: "Film lighting, depth, and atmosphere",
    swatch: ["#071b26", "#b04d32", "#e1bd70"],
    recipe: {
      medium: "cinematic photographic treatment",
      characteristics: ["intentional film lighting", "controlled highlight rolloff", "cinematic color separation", "natural depth and atmosphere", "subtle film grain"],
      preservation: ["photorealism", "subject identity", "the camera angle", "the main composition"],
      exclusions: ["unrelated props", "text", "logos", "watermarks"],
    },
  },
  {
    id: "anime",
    version: 1,
    label: "Anime Theme",
    description: "Cel shading and painted environments",
    swatch: ["#24365e", "#e98272", "#f4dca6"],
    recipe: {
      medium: "hand-drawn cinematic anime illustration",
      characteristics: ["clean expressive linework", "layered cel shading", "painted environmental backgrounds", "a cohesive stylized color palette"],
      preservation: ["recognizable subjects", "facial identity", "poses", "the principal composition"],
      exclusions: ["unrelated characters", "text", "logos", "watermarks"],
    },
  },
] as const;

export function getTransformPreset(id: string, version: number): TransformPreset | null {
  return transformPresets.find((preset) => preset.id === id && preset.version === version) ?? null;
}

export function isTransformPresetId(value: string): value is TransformPresetId {
  return transformPresetIds.includes(value as TransformPresetId);
}
