import { describe, expect, it } from "vitest";
import { imageFormatCapabilities, resolveImageFormat, resolveImageTreatment } from "./creation-presets";

describe("AI image creation presets", () => {
  it("resolves only the four application-owned destination formats", () => {
    expect(imageFormatCapabilities()).toEqual([
      { id: "instagram-post", width: 1024, height: 1024 },
      { id: "instagram-portrait", width: 1024, height: 1280 },
      { id: "story-reel", width: 720, height: 1280 },
      { id: "youtube-thumbnail", width: 1280, height: 720 },
    ]);
    expect(resolveImageFormat("story-reel")).toMatchObject({ width: 720, height: 1280 });
  });

  it("keeps Auto unconstrained and avoids named artists in treatment instructions", () => {
    expect(resolveImageTreatment("auto")).toBeNull();
    expect(resolveImageTreatment("anime")).toContain("without imitating a named artist");
  });
});
