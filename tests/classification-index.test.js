import { describe, it, expect } from "vitest";
import { parseCsvText } from "../src/data-loader.js";

/**
 * Builds classification index structures the same way data-loader does,
 * for testing filtering and deduplication logic.
 */
function buildClassificationIndexes(rows, today) {
  const classificationsByAward = new Map();
  const classificationsByAwardAndRateType = new Map();

  const isRowOperative = (operativeFrom, operativeTo) => {
    if (!today) return true;
    const parse = (d) => (d ? new Date(d) : null);
    const from = parse(operativeFrom);
    const to = parse(operativeTo);
    if (from && today < from) return false;
    if (to && today > to) return false;
    return true;
  };

  for (const row of rows) {
    const {
      awardCode,
      isHeading,
      employeeRateTypeCode,
      classification,
      classificationLevel,
      classificationFixedID,
      parentClassificationName,
      baseRate,
      baseRateType,
      calculatedRate,
      calculatedRateType,
    } = row;

    if (!awardCode) continue;
    if (String(isHeading).trim() === "1") continue;
    if (
      !isRowOperative(row.operativeFrom, row.operativeTo)
    )
      continue;

    const cBase = parseFloat(baseRate || "0") || 0;
    const cCalculated = parseFloat(calculatedRate || "0") || cBase;

    const obj = {
      awardCode,
      employeeRateTypeCode: employeeRateTypeCode || "",
      classification: classification || "",
      classificationLevel: classificationLevel || "",
      classificationFixedID,
      parentClassificationName,
      baseRate: cBase,
      baseRateType: baseRateType || "",
      calculatedRate: cCalculated,
      calculatedRateType: calculatedRateType || "",
    };

    if (!classificationsByAward.has(awardCode)) {
      classificationsByAward.set(awardCode, []);
    }
    classificationsByAward.get(awardCode).push(obj);

    const rt = employeeRateTypeCode || "";
    const key = `${awardCode}|${rt}`;
    if (!classificationsByAwardAndRateType.has(key)) {
      classificationsByAwardAndRateType.set(key, []);
    }
    classificationsByAwardAndRateType.get(key).push(obj);
  }

  return { classificationsByAward, classificationsByAwardAndRateType };
}

describe("classification indexing", () => {
  it("excludes isHeading rows", () => {
    const csv = `awardCode,isHeading,employeeRateTypeCode,classification,classificationLevel,baseRate,calculatedRate,baseRateType,calculatedRateType,operativeFrom,operativeTo
MA000001,0,AD,Level 1,1,30,30,Hourly,Hourly,2025-01-01,
MA000001,1,AD,Group A,,,,,,2025-01-01,`;
    const rows = parseCsvText(csv);
    const today = new Date("2025-07-01");
    const { classificationsByAward } = buildClassificationIndexes(rows, today);
    const list = classificationsByAward.get("MA000001") || [];
    expect(list).toHaveLength(1);
    expect(list[0].classification).toBe("Level 1");
  });

  it("includes both AD and CA when present for same award", () => {
    const csv = `awardCode,isHeading,employeeRateTypeCode,classification,classificationLevel,baseRate,calculatedRate,baseRateType,calculatedRateType,operativeFrom,operativeTo
MA000009,0,AD,Clerical Level 3,3,30.2,30.2,Hourly,Hourly,2025-01-01,
MA000009,0,CA,Clerical Level 3,3,30.2,37.75,Hourly,Hourly,2025-01-01,`;
    const rows = parseCsvText(csv);
    const today = new Date("2025-07-01");
    const { classificationsByAwardAndRateType } = buildClassificationIndexes(
      rows,
      today
    );
    expect(classificationsByAwardAndRateType.get("MA000009|AD")).toHaveLength(1);
    expect(classificationsByAwardAndRateType.get("MA000009|CA")).toHaveLength(
      1
    );
    const ca = classificationsByAwardAndRateType.get("MA000009|CA")[0];
    expect(ca.calculatedRate).toBe(37.75);
    expect(ca.baseRate).toBe(30.2);
  });
});
