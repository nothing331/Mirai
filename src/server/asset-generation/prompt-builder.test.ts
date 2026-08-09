import { describe, expect, it } from "vitest";
import { buildAssetGenerationPrompt, buildImageGenerationPrompt, buildImageTransformPrompt, chooseMatteColor } from "./prompt-builder";

describe("asset generation prompt builder", () => {
  it("turns the structured brief into a symbol-only instruction", () => {
    const prompt = buildAssetGenerationPrompt({
      assetType: "logo-mark",
      description: "A calm mountain made from two rising planes",
      style: "minimal-geometric",
      detail: "simple",
      colorMode: "custom",
      colors: ["#112233", "#eedd44"],
    }, "#00ff66");

    expect(prompt).toContain("standalone symbol-only logo mark");
    expect(prompt).toContain("A calm mountain made from two rising planes");
    expect(prompt).toContain("Do not include words, letters, numbers");
    expect(prompt).toContain("perfectly flat, uniform #00ff66");
    expect(prompt).toContain("at least 15% empty padding");
    expect(prompt).toContain("Use only these foreground colors: #112233, #eedd44");
  });

  it("lets the model select the foreground palette in auto mode", () => {
    const prompt = buildAssetGenerationPrompt({
      assetType: "icon",
      description: "A warm beacon for a neighborhood community",
      style: "flat",
      detail: "balanced",
      colorMode: "auto",
      colors: [],
    }, "#00ff66");

    expect(prompt).toContain("Choose a cohesive palette of one to three foreground colors");
    expect(prompt).toContain("Do not use #00ff66 in the mark");
    expect(prompt).not.toContain("Use only these foreground colors");
  });

  it("chooses a matte far from the requested foreground palette", () => {
    expect(chooseMatteColor(["#00ff55", "#171714"])).not.toBe("#00ff66");
    expect(chooseMatteColor([])).toBe("#00ff66");
  });

  it("builds complete-image and preservation-aware transform instructions", () => {
    expect(buildImageGenerationPrompt("A glass cabin in a pine forest")).toContain("Fill the complete frame");
    const transform = buildImageTransformPrompt("Turn daylight into blue hour");
    expect(transform).toContain("Preserve recognizable subjects, layout, perspective");
    expect(transform).toContain("Turn daylight into blue hour");
  });
});
