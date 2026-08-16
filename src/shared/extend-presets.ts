export const extendPresetIds = ["youtube-thumbnail", "instagram-portrait", "instagram-classic", "instagram-square", "story-reel", "landscape-post"] as const;

export type ExtendPresetId = typeof extendPresetIds[number];

export interface ExtendPreset {
  id: ExtendPresetId;
  version: 1;
  label: string;
  description: string;
  ratio: readonly [width: number, height: number];
}

export const extendPresets: readonly ExtendPreset[] = [
  { id: "youtube-thumbnail", version: 1, label: "YouTube", description: "Thumbnail · 16:9", ratio: [16, 9] },
  { id: "instagram-portrait", version: 1, label: "Instagram", description: "Portrait · 3:4", ratio: [3, 4] },
  { id: "instagram-classic", version: 1, label: "Classic post", description: "Portrait · 4:5", ratio: [4, 5] },
  { id: "instagram-square", version: 1, label: "Square post", description: "Square · 1:1", ratio: [1, 1] },
  { id: "story-reel", version: 1, label: "Story / Reel", description: "Full screen · 9:16", ratio: [9, 16] },
  { id: "landscape-post", version: 1, label: "Landscape", description: "Wide post · 1.91:1", ratio: [191, 100] },
] as const;

export function getExtendPreset(id: string, version: number): ExtendPreset | null {
  return extendPresets.find((preset) => preset.id === id && preset.version === version) ?? null;
}

export function isExtendPresetId(value: string): value is ExtendPresetId {
  return extendPresetIds.includes(value as ExtendPresetId);
}
