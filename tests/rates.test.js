import { describe, it, expect } from "vitest";
import {
  formatMoney,
  calcCasualLoading,
  getDisplayRates,
  STANDARD_HOURS_PER_WEEK,
} from "../src/lib/rates.js";

describe("formatMoney", () => {
  it("formats number to 2 decimal places with $", () => {
    expect(formatMoney(30.2)).toBe("$30.20");
    expect(formatMoney(37.75)).toBe("$37.75");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("returns empty string for null, undefined, NaN", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney(NaN)).toBe("");
  });
});

describe("calcCasualLoading", () => {
  it("returns null when base or calculated is zero/null", () => {
    expect(calcCasualLoading(0, 37.75)).toBe(null);
    expect(calcCasualLoading(30.2, 0)).toBe(null);
    expect(calcCasualLoading(null, 37.75)).toBe(null);
    expect(calcCasualLoading(30.2, null)).toBe(null);
  });

  it("returns 25 when calculated is 25% above base", () => {
    expect(calcCasualLoading(30.2, 37.75)).toBeCloseTo(25, 1);
  });

  it("returns null when calculated equals base (no loading)", () => {
    expect(calcCasualLoading(30.2, 30.2)).toBe(null);
  });

  it("returns null when calculated is less than base", () => {
    expect(calcCasualLoading(30.2, 25)).toBe(null);
  });
});

describe("getDisplayRates", () => {
  it("uses hourly for both when base and calculated are hourly", () => {
    const c = {
      baseRate: 30.2,
      baseRateType: "Hourly",
      calculatedRate: 37.75,
      calculatedRateType: "Hourly",
    };
    const r = getDisplayRates(c);
    expect(r.baseValue).toBe(30.2);
    expect(r.baseUnit).toBe("hour");
    expect(r.calculatedValue).toBe(37.75);
    expect(r.calculatedUnit).toBe("hour");
  });

  it("uses weekly for base and hour for calculated when types differ", () => {
    const c = {
      baseRate: 1040.7,
      baseRateType: "Weekly",
      calculatedRate: 29.73,
      calculatedRateType: "Hourly",
    };
    const r = getDisplayRates(c);
    expect(r.baseValue).toBe(1040.7);
    expect(r.baseUnit).toBe("week");
    expect(r.calculatedValue).toBe(29.73);
    expect(r.calculatedUnit).toBe("hour");
  });

  it("derives hourly from weekly when calculated was fallback (same as base)", () => {
    const c = {
      baseRate: 1182.8,
      baseRateType: "Weekly",
      calculatedRate: 1182.8,
      calculatedRateType: "",
    };
    const r = getDisplayRates(c);
    expect(r.baseValue).toBe(1182.8);
    expect(r.baseUnit).toBe("week");
    expect(r.calculatedValue).toBeCloseTo(1182.8 / STANDARD_HOURS_PER_WEEK, 2);
    expect(r.calculatedUnit).toBe("hour");
  });

  it("uses 38 hours per week for derivation", () => {
    expect(STANDARD_HOURS_PER_WEEK).toBe(38);
    const c = {
      baseRate: 760,
      baseRateType: "Weekly",
      calculatedRate: 760,
      calculatedRateType: "",
    };
    const r = getDisplayRates(c);
    expect(r.calculatedValue).toBeCloseTo(760 / 38, 2);
  });

  it("does not derive when base and calculated differ (real hourly in CSV)", () => {
    const c = {
      baseRate: 1182.8,
      baseRateType: "Weekly",
      calculatedRate: 31.13,
      calculatedRateType: "Hourly",
    };
    const r = getDisplayRates(c);
    expect(r.calculatedValue).toBe(31.13);
    expect(r.calculatedUnit).toBe("hour");
  });

  it("handles missing rate types (defaults to hourly)", () => {
    const r = getDisplayRates({
      baseRate: 30,
      calculatedRate: 30,
    });
    expect(r.baseUnit).toBe("hour");
    expect(r.calculatedUnit).toBe("hour");
  });
});
