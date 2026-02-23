import { describe, it, expect } from "vitest";
import { parseCsvText, isRowOperative } from "../src/data-loader.js";

describe("parseCsvText", () => {
  it("returns empty array for empty string", () => {
    expect(parseCsvText("")).toEqual([]);
  });

  it("parses header only as empty data", () => {
    expect(parseCsvText("a,b,c")).toEqual([]);
  });

  it("parses one data row", () => {
    const out = parseCsvText("a,b,c\n1,2,3");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("parses multiple rows", () => {
    const out = parseCsvText("x,y\n1,2\n3,4");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ x: "1", y: "2" });
    expect(out[1]).toEqual({ x: "3", y: "4" });
  });

  it("handles quoted fields with commas", () => {
    const out = parseCsvText('a,b\n"1,2",3');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ a: "1,2", b: "3" });
  });

  it("handles escaped quotes in quoted field", () => {
    const out = parseCsvText('a,b\n"say ""hi""",x');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ a: 'say "hi"', b: "x" });
  });

  it("trims header names", () => {
    const out = parseCsvText(" a , b \n1,2");
    expect(out[0]).toEqual({ a: "1", b: "2" });
  });

  it("skips empty rows", () => {
    const out = parseCsvText("a,b\n1,2\n\n3,4");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ a: "1", b: "2" });
    expect(out[1]).toEqual({ a: "3", b: "4" });
  });

  it("handles numeric-looking values as strings", () => {
    const out = parseCsvText("baseRate,baseRateType\n1040.70,Weekly");
    expect(out[0].baseRate).toBe("1040.70");
    expect(out[0].baseRateType).toBe("Weekly");
  });
});

describe("isRowOperative", () => {
  const today = new Date("2025-07-15");

  it("returns true when no dates provided", () => {
    expect(isRowOperative(null, null, today)).toBe(true);
    expect(isRowOperative("", "", today)).toBe(true);
  });

  it("returns false when today is before operativeFrom", () => {
    expect(isRowOperative("2025-08-01", null, today)).toBe(false);
    // Use ISO-style date; DD-MM-YYYY is locale-dependent in Date parsing
    expect(isRowOperative("2025-09-01", null, today)).toBe(false);
  });

  it("returns false when today is after operativeTo", () => {
    expect(isRowOperative(null, "2025-06-01", today)).toBe(false);
  });

  it("returns true when today is within range", () => {
    expect(isRowOperative("2025-01-01", "2025-12-31", today)).toBe(true);
    expect(isRowOperative("2025-07-01", null, today)).toBe(true);
    expect(isRowOperative(null, "2025-08-01", today)).toBe(true);
  });

  it("returns true when today is null/undefined (no filter)", () => {
    expect(isRowOperative("2025-08-01", "2025-09-01", null)).toBe(true);
  });
});
