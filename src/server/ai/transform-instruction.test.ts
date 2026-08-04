import { describe, expect, it } from "vitest";
import { buildTransformInstruction } from "./transform-instruction";

describe("buildTransformInstruction", () => {
  it("resolves a preset and user refinement", () => {
    const instruction = buildTransformInstruction({ presetId: "anime", presetVersion: 1, userPrompt: "Warm evening light", preservationMode: "balanced" });
    expect(instruction).toContain("hand-drawn cinematic anime illustration");
    expect(instruction).toContain("Warm evening light");
    expect(instruction).toContain("Preserve recognizable subjects and the principal composition");
  });

  it("supports a custom prompt without a preset", () => {
    expect(buildTransformInstruction({ presetId: null, presetVersion: null, userPrompt: "A cyanotype print", preservationMode: "faithful" })).toContain("cyanotype print");
  });

  it("rejects empty and unknown transformations", () => {
    expect(() => buildTransformInstruction({ presetId: null, presetVersion: null, userPrompt: "", preservationMode: "balanced" })).toThrow(/Choose/);
    expect(() => buildTransformInstruction({ presetId: "anime", presetVersion: 2, userPrompt: "", preservationMode: "balanced" })).toThrow(/version/);
  });
});
