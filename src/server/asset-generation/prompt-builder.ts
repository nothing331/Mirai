import type { AssetGenerationBrief } from "@/shared/asset-generation";

const styleInstructions: Record<AssetGenerationBrief["style"], string> = {
  "minimal-geometric": "minimal geometric construction with deliberate, simple shapes",
  monoline: "clean monoline construction with one consistent optical stroke weight",
  flat: "flat graphic construction with crisp color regions and no dimensional effects",
  bold: "bold compact construction with a strong silhouette and substantial visual weight",
  playful: "playful but controlled construction with friendly shapes and clear visual rhythm",
};

const detailInstructions: Record<AssetGenerationBrief["detail"], string> = {
  simple: "Use the fewest shapes necessary and keep the silhouette unmistakable at 32 pixels.",
  balanced: "Use moderate detail while keeping the design clear at 32 pixels.",
  detailed: "Use purposeful internal detail without weakening the small-size silhouette.",
};

const matteOptions = ["#00ff66", "#ff00cc", "#00d9ff", "#fff000"];

export function chooseMatteColor(colors: string[]): string {
  if (colors.length === 0) return matteOptions[0];
  const palette = colors.map(hexToRgb);
  return matteOptions.reduce((best, option) => minimumColorDistance(hexToRgb(option), palette) > minimumColorDistance(hexToRgb(best), palette) ? option : best);
}

export function buildAssetGenerationPrompt(brief: AssetGenerationBrief, matteColor = chooseMatteColor(brief.colorMode === "custom" ? brief.colors : [])): string {
  const kind = brief.assetType === "icon" ? "standalone application or interface icon" : "standalone symbol-only logo mark";
  const paletteInstruction = brief.colorMode === "auto"
    ? `Choose a cohesive palette of one to three foreground colors that supports the concept and remains distinct from ${matteColor}. Do not use ${matteColor} in the mark.`
    : `Use only these foreground colors: ${brief.colors.join(", ")}.`;
  return [
    `Create one ${kind}.`,
    "",
    "Concept:",
    brief.description.trim(),
    "",
    "Visual direction:",
    `${styleInstructions[brief.style]}.`,
    detailInstructions[brief.detail],
    paletteInstruction,
    "",
    "Composition:",
    "Center one isolated mark in a square composition.",
    "Keep at least 15% empty padding on every edge.",
    "Use a strong, recognizable silhouette and clean boundaries.",
    "Return a distinct visual concept rather than a presentation board.",
    "",
    "Output restrictions:",
    "Symbol only. Do not include words, letters, numbers, slogans, signatures, labels, or watermarks.",
    "Do not create stationery, an app screen, a product mockup, a photograph, a scene, a border, or a grid.",
    "Do not imitate an existing company logo or recognizable brand mark.",
    "Do not add shadows, reflections, glow, texture, gradients, or background decoration.",
    `Render the empty background as one perfectly flat, uniform ${matteColor} color extending to every canvas edge.`,
  ].join("\n");
}

export function buildImageGenerationPrompt(prompt: string): string {
  return [
    "Create one complete, production-ready image from the user's request.",
    "",
    "User request:",
    prompt.trim(),
    "",
    "Output requirements:",
    "Fill the complete frame with one coherent composition at the requested aspect ratio.",
    "Do not create a comparison, contact sheet, presentation board, frame, border, watermark, signature, or UI mockup unless the user explicitly requests one.",
    "Render only the final image.",
  ].join("\n");
}

export function buildImageTransformPrompt(prompt: string): string {
  return [
    "Transform the provided source image according to the user's instruction.",
    "",
    "User instruction:",
    prompt.trim(),
    "",
    "Preservation requirements:",
    "Use the source as the visual and compositional reference.",
    "Preserve recognizable subjects, layout, perspective, and details that the instruction does not ask to change.",
    "Return one complete transformed image, not a before-and-after comparison, contact sheet, frame, watermark, or explanation.",
  ].join("\n");
}

function minimumColorDistance(color: [number, number, number], palette: Array<[number, number, number]>): number {
  return Math.min(...palette.map((candidate) => Math.hypot(color[0] - candidate[0], color[1] - candidate[1], color[2] - candidate[2])));
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}
