import { createMask } from "./mask";
import type { ProcessingMask } from "./types";

function horizontalPass(data: Uint8ClampedArray, width: number, height: number, radius: number, mode: "max" | "min") {
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = mode === "max" ? 0 : 255;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;
        const sample = sampleX < 0 || sampleX >= width ? (mode === "max" ? 0 : 255) : data[y * width + sampleX];
        value = mode === "max" ? Math.max(value, sample) : Math.min(value, sample);
      }
      output[y * width + x] = value;
    }
  }
  return output;
}

function verticalPass(data: Uint8ClampedArray, width: number, height: number, radius: number, mode: "max" | "min") {
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = mode === "max" ? 0 : 255;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;
        const sample = sampleY < 0 || sampleY >= height ? (mode === "max" ? 0 : 255) : data[sampleY * width + x];
        value = mode === "max" ? Math.max(value, sample) : Math.min(value, sample);
      }
      output[y * width + x] = value;
    }
  }
  return output;
}

function morphology(mask: ProcessingMask, radius: number, mode: "max" | "min"): ProcessingMask {
  const binary = new Uint8ClampedArray(mask.data.length);
  for (let index = 0; index < binary.length; index += 1) binary[index] = mask.data[index] > 127 ? 255 : 0;
  const horizontal = horizontalPass(binary, mask.width, mask.height, radius, mode);
  return { ...mask, data: verticalPass(horizontal, mask.width, mask.height, radius, mode) };
}

function removeSmallComponents(mask: ProcessingMask, minimumArea: number): ProcessingMask {
  const output = new Uint8ClampedArray(mask.data);
  const visited = new Uint8Array(mask.data.length);
  for (let start = 0; start < output.length; start += 1) {
    if (visited[start] || output[start] === 0) continue;
    const component: number[] = [];
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      component.push(index);
      const x = index % mask.width;
      const y = Math.floor(index / mask.width);
      const neighbors = [x > 0 ? index - 1 : -1, x + 1 < mask.width ? index + 1 : -1, y > 0 ? index - mask.width : -1, y + 1 < mask.height ? index + mask.width : -1];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && !visited[neighbor] && output[neighbor] > 0) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    if (component.length < minimumArea) for (const index of component) output[index] = 0;
  }
  return { ...mask, data: output };
}

/** Closes small contour gaps and removes noise without changing mask dimensions. */
export function cleanRasterMask(mask: ProcessingMask, radius: number, minimumIslandArea: number): ProcessingMask {
  if (radius <= 0) return removeSmallComponents(mask, minimumIslandArea);
  const dilated = morphology(mask, radius, "max");
  const closed = morphology(dilated, radius, "min");
  return removeSmallComponents(closed, minimumIslandArea);
}

/** Unions a newly cleaned lasso into an existing selection without mutating either mask. */
export function unionMasks(base: ProcessingMask, addition: ProcessingMask): ProcessingMask {
  if (base.width !== addition.width || base.height !== addition.height) throw new Error("Selection masks must have matching dimensions.");
  const result = createMask(base.width, base.height);
  for (let index = 0; index < result.data.length; index += 1) result.data[index] = Math.max(base.data[index], addition.data[index]);
  return result;
}
