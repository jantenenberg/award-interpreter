import { describe, it, expect } from "vitest";
import { penaltyMatchesSelection } from "../src/lib/penalties.js";

describe("penaltyMatchesSelection", () => {
  const basePenalty = {
    awardCode: "MA000009",
    classification: "Clerical Level 3",
    classificationLevel: "3",
    employeeRateTypeCode: "AD",
  };

  const defaultClassification = {
    classification: "Clerical Level 3",
    classificationLevel: "3",
  };

  const selection = (rateType, classification = defaultClassification) => ({
    awardCode: "MA000009",
    rateType,
    classification,
  });

  it("returns false when penalty is null", () => {
    expect(penaltyMatchesSelection(null, selection("AD"))).toBe(false);
  });

  it("returns false when award codes differ", () => {
    const p = { ...basePenalty, awardCode: "MA000004" };
    expect(penaltyMatchesSelection(p, selection("AD"))).toBe(false);
  });

  it("returns true when award and classification name match and rate type AD", () => {
    expect(penaltyMatchesSelection(basePenalty, selection("AD"))).toBe(true);
  });

  it("returns true when penalty employeeRateTypeCode is AD (wildcard)", () => {
    const p = { ...basePenalty, employeeRateTypeCode: "AD" };
    expect(penaltyMatchesSelection(p, selection("CA"))).toBe(true);
  });

  it("returns true when penalty rate type matches selection", () => {
    const p = { ...basePenalty, employeeRateTypeCode: "CA" };
    expect(penaltyMatchesSelection(p, selection("CA"))).toBe(true);
  });

  it("returns false when penalty rate type does not match and is not AD", () => {
    const p = { ...basePenalty, employeeRateTypeCode: "JR" };
    expect(penaltyMatchesSelection(p, selection("CA", {}))).toBe(false);
  });

  it("matches by classification name (case insensitive)", () => {
    const p = { ...basePenalty, classification: "clerical level 3" };
    expect(
      penaltyMatchesSelection(p, selection("AD", { classification: "Clerical Level 3" }))
    ).toBe(true);
  });

  it("matches by classification level when classification name differs", () => {
    const p = {
      ...basePenalty,
      classification: "Level 2",
      classificationLevel: "2",
    };
    const sel = selection("AD", {
      classification: "Level 2",
      classificationLevel: "2",
    });
    expect(penaltyMatchesSelection(p, sel)).toBe(true);
  });

  it("returns false when classification does not match", () => {
    const p = { ...basePenalty, classification: "Level 2", classificationLevel: "2" };
    const sel = selection("AD", {
      classification: "Clerical Level 3",
      classificationLevel: "3",
    });
    expect(penaltyMatchesSelection(p, sel)).toBe(false);
  });

  it("returns true when no rate type in selection (allow all)", () => {
    const sel = {
      awardCode: "MA000009",
      rateType: "",
      classification: defaultClassification,
    };
    expect(penaltyMatchesSelection(basePenalty, sel)).toBe(true);
  });
});
