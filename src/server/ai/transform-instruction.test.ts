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

  it("locks generation to the planned source subjects and composition", () => {
    const instruction = buildTransformInstruction({
      presetId: "anime",
      presetVersion: 1,
      userPrompt: "",
      preservationMode: "faithful",
      plan: {
        sourceSummary: "A rocket launches through a blue sky",
        primarySubjects: [{ description: "rocket", count: 1, position: "from lower left to upper right", poseOrGeometry: "a diagonal rising orientation", identityCues: ["three engines", "bright exhaust"] }],
        composition: { framing: "wide landscape", cameraAngle: "low angle", spatialRelationships: ["exhaust trails behind the rocket"], backgroundStructure: ["open blue sky"] },
        mustPreserve: ["the rocket silhouette"],
        prohibitedChanges: ["no people or unrelated vehicles"],
        confidence: "high",
      },
    });

    expect(instruction).toContain("not a new scene generation");
    expect(instruction).toContain("1 × rocket");
    expect(instruction).toContain("three engines");
    expect(instruction).toContain("no people or unrelated vehicles");
  });
});
