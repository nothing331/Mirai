import type { ProcessingMask } from "./types";

/** Applies a provider candidate only through the effective source-resolution mask. */
export function compositeCandidate(
  input: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
  mask: ProcessingMask,
): Uint8ClampedArray {
  if (input.length !== candidate.length || input.length !== mask.width * mask.height * 4) throw new Error("Candidate, mask, and input dimensions must match.");
  const output = new Uint8ClampedArray(input);
  for (let index = 0; index < mask.data.length; index += 1) {
    const amount = mask.data[index] / 255;
    if (amount === 0) continue;
    const pixel = index * 4;
    for (let channel = 0; channel < 4; channel += 1) output[pixel + channel] = Math.round(candidate[pixel + channel] * amount + input[pixel + channel] * (1 - amount));
  }
  return output;
}
