import { describe, expect, it } from "vitest";
import { blocksTransformAcceptance, unavailableTransformFidelityAssessment } from "./transform-fidelity";

describe("Transform fidelity acceptance", () => {
  it("blocks failed semantic validation for Faithful and Balanced modes", () => {
    const assessment = unavailableTransformFidelityAssessment();
    expect(blocksTransformAcceptance("faithful", assessment)).toBe(true);
    expect(blocksTransformAcceptance("balanced", assessment)).toBe(true);
  });

  it("keeps Imaginative mode manually reviewable", () => {
    expect(blocksTransformAcceptance("imaginative", unavailableTransformFidelityAssessment())).toBe(false);
  });
});
