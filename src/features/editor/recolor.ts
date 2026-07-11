import type { ImageVersion, ProcessingMask } from "./types";

/** Converts the editor's six-digit color value into RGB channels. */
export function parseHexColor(color: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Choose a valid color.");
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number];
}

/** Converts RGB channels to HSL so source lightness can survive recoloring. */
function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue = max === r ? ((g - b) / delta + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / delta + 2) / 6 : ((r - g) / delta + 4) / 6;
  return [hue, saturation, lightness];
}

/** Converts target hue/saturation and preserved source lightness back to RGB. */
function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return [channel, channel, channel];
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number) => {
    let value = hue + offset;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    const result = value < 1 / 6 ? p + (q - p) * 6 * value : value < 1 / 2 ? q : value < 2 / 3 ? p + (q - p) * (2 / 3 - value) * 6 : p;
    return Math.round(result * 255);
  };
  return [channel(1 / 3), channel(0), channel(-1 / 3)];
}

/** Applies target hue and saturation while retaining source lightness, alpha, and all unmasked bytes. */
export function recolorPixels(input: ImageVersion, mask: ProcessingMask, color: string): Uint8ClampedArray {
  if (mask.width !== input.width || mask.height !== input.height || mask.data.length !== input.width * input.height) {
    throw new Error("The selection does not match the image dimensions.");
  }
  const [targetHue, targetSaturation] = rgbToHsl(...parseHexColor(color));
  const output = new Uint8ClampedArray(input.pixels);
  for (let index = 0; index < mask.data.length; index += 1) {
    const amount = mask.data[index] / 255;
    if (amount === 0) continue;
    const pixel = index * 4;
    const [, , sourceLightness] = rgbToHsl(input.pixels[pixel], input.pixels[pixel + 1], input.pixels[pixel + 2]);
    const recolored = hslToRgb(targetHue, targetSaturation, sourceLightness);
    output[pixel] = Math.round(input.pixels[pixel] * (1 - amount) + recolored[0] * amount);
    output[pixel + 1] = Math.round(input.pixels[pixel + 1] * (1 - amount) + recolored[1] * amount);
    output[pixel + 2] = Math.round(input.pixels[pixel + 2] * (1 - amount) + recolored[2] * amount);
  }
  return output;
}
