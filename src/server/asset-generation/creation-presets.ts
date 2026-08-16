import type { ImageFormat, ImageTreatment } from "@/shared/asset-generation";

export interface ResolvedImageFormat {
  id: ImageFormat;
  width: number;
  height: number;
  compositionInstruction: string;
}

const imageFormatRegistry: Record<ImageFormat, ResolvedImageFormat> = {
  "instagram-post": { id: "instagram-post", width: 1024, height: 1024, compositionInstruction: "Compose for a square 1:1 frame suitable for an Instagram post." },
  "instagram-portrait": { id: "instagram-portrait", width: 1024, height: 1280, compositionInstruction: "Compose for a 4:5 portrait frame suitable for an Instagram feed post." },
  "story-reel": { id: "story-reel", width: 720, height: 1280, compositionInstruction: "Compose for a vertical 9:16 frame suitable for a story or reel." },
  "youtube-thumbnail": { id: "youtube-thumbnail", width: 1280, height: 720, compositionInstruction: "Compose for a widescreen 16:9 frame suitable for a YouTube thumbnail." },
};

const imageTreatmentRegistry: Record<ImageTreatment, string | null> = {
  auto: null,
  photograph: "Render it as a photographic image with natural camera behavior, credible lighting, and realistic materials.",
  sketch: "Render it as a hand-drawn graphite sketch with purposeful line work, natural tonal shading, and subtle paper texture.",
  watercolor: "Render it as a watercolor illustration with organic pigment variation, translucent washes, and subtle paper character.",
  "digital-art": "Render it as a polished digital illustration with deliberate shapes, coherent lighting, and purposeful color.",
  "three-dimensional": "Render it as a dimensional 3D scene with coherent geometry, materials, depth, and studio-quality lighting.",
  anime: "Render it as a clean anime-inspired illustration without imitating a named artist, existing franchise, or protected character.",
};

export function resolveImageFormat(format: ImageFormat): ResolvedImageFormat {
  return imageFormatRegistry[format];
}

export function imageFormatCapabilities(): Array<Pick<ResolvedImageFormat, "id" | "width" | "height">> {
  return Object.values(imageFormatRegistry).map(({ id, width, height }) => ({ id, width, height }));
}

export function resolveImageTreatment(treatment: ImageTreatment): string | null {
  return imageTreatmentRegistry[treatment];
}
