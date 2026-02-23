import { describe, it, expect, beforeAll } from "vitest";
import { loadAwards, createAwardsByCodeIndex, getActiveAwards } from "../src/lib/award-loader.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the Excel file - try multiple possible locations
const possiblePaths = [
  join(__dirname, "../../Downloads/map-award-export-2025.xlsx"),
  join(__dirname, "../Downloads/map-award-export-2025.xlsx"),
  "/Users/jantenenberg/Downloads/map-award-export-2025.xlsx",
];

const EXCEL_FILE_PATH = possiblePaths.find(p => existsSync(p));

if (!EXCEL_FILE_PATH) {
  console.warn("Excel file not found. Tests will be skipped. Tried paths:", possiblePaths);
}

describe("Award loader", () => {
  let awards;
  let awardsByCode;

  beforeAll(async () => {
    if (!EXCEL_FILE_PATH) {
      throw new Error("Excel file not found. Please ensure map-award-export-2025.xlsx is available.");
    }
    awards = await loadAwards(EXCEL_FILE_PATH);
    awardsByCode = createAwardsByCodeIndex(awards);
  });

  describe("loadAwards", () => {
    it("loads exactly 155 records", () => {
      expect(awards).toHaveLength(155);
    });

    it("loads MA000004 award correctly", () => {
      const award = awardsByCode.get("MA000004");
      expect(award).toBeDefined();
      expect(award.awardCode).toBe("MA000004");
      expect(award.name).toBe("General Retail Industry Award 2020");
      expect(award.awardFixedID).toBeTypeOf("number");
      expect(award.versionNumber).toBeTypeOf("number");
    });

    it("loads MA000001 award correctly", () => {
      const award = awardsByCode.get("MA000001");
      expect(award).toBeDefined();
      expect(award.awardCode).toBe("MA000001");
    });

    it("parses all award fields with correct types", () => {
      for (const award of awards) {
        expect(award.awardID).toBeTypeOf("string");
        expect(award.awardCode).toBeTypeOf("string");
        expect(award.name).toBeTypeOf("string");
        expect(award.awardFixedID).toBeTypeOf("number");
        expect(award.versionNumber).toBeTypeOf("number");
        
        // Nullable date fields
        if (award.awardOperativeFrom != null) {
          expect(award.awardOperativeFrom).toBeInstanceOf(Date);
        }
        if (award.awardOperativeTo != null) {
          expect(award.awardOperativeTo).toBeInstanceOf(Date);
        }
        if (award.lastModifiedDateTime != null) {
          expect(award.lastModifiedDateTime).toBeInstanceOf(Date);
        }
      }
    });

    it("trims whitespace from string fields", () => {
      for (const award of awards) {
        expect(award.awardID).toBe(award.awardID.trim());
        expect(award.awardCode).toBe(award.awardCode.trim());
        expect(award.name).toBe(award.name.trim());
      }
    });

    it("handles null values in awardOperativeTo gracefully", () => {
      const awardsWithNullTo = awards.filter(a => a.awardOperativeTo === null);
      expect(awardsWithNullTo.length).toBeGreaterThan(0);
      for (const award of awardsWithNullTo) {
        expect(award.awardOperativeTo).toBeNull();
      }
    });

    it("handles null values in lastModifiedDateTime gracefully", () => {
      const awardsWithNullModified = awards.filter(a => a.lastModifiedDateTime === null);
      // Some may be null, that's fine
      for (const award of awards) {
        if (award.lastModifiedDateTime === null) {
          expect(award.lastModifiedDateTime).toBeNull();
        } else {
          expect(award.lastModifiedDateTime).toBeInstanceOf(Date);
        }
      }
    });

    it("does not have undefined or unparsed date fields", () => {
      for (const award of awards) {
        // awardOperativeFrom should be Date or null, never undefined
        expect(award.awardOperativeFrom === undefined).toBe(false);
        if (award.awardOperativeFrom != null) {
          expect(award.awardOperativeFrom).toBeInstanceOf(Date);
        }
        
        // awardOperativeTo should be Date or null, never undefined
        expect(award.awardOperativeTo === undefined).toBe(false);
        if (award.awardOperativeTo != null) {
          expect(award.awardOperativeTo).toBeInstanceOf(Date);
        }
        
        // lastModifiedDateTime should be Date or null, never undefined
        expect(award.lastModifiedDateTime === undefined).toBe(false);
        if (award.lastModifiedDateTime != null) {
          expect(award.lastModifiedDateTime).toBeInstanceOf(Date);
        }
      }
    });
  });

  describe("createAwardsByCodeIndex", () => {
    it("creates index mapping awardCode → Award", () => {
      expect(awardsByCode).toBeInstanceOf(Map);
      expect(awardsByCode.size).toBe(155);
    });

    it("allows O(1) lookup by awardCode", () => {
      const award = awardsByCode.get("MA000004");
      expect(award).toBeDefined();
      expect(award.awardCode).toBe("MA000004");
    });

    it("handles duplicate awardCodes (keeps first)", () => {
      // This test verifies the warning behavior - if duplicates exist, first is kept
      const testAwards = [
        { awardCode: "TEST001", name: "First" },
        { awardCode: "TEST001", name: "Second" },
      ];
      const index = createAwardsByCodeIndex(testAwards);
      expect(index.size).toBe(1);
      expect(index.get("TEST001").name).toBe("First");
    });
  });

  describe("getActiveAwards", () => {
    it("includes awards where awardOperativeTo is null", () => {
      const asOfDate = new Date("2025-07-15");
      const active = getActiveAwards(awards, asOfDate);
      
      // Awards with null operativeTo should be included if operativeFrom <= asOfDate
      const nullToAwards = awards.filter(a => a.awardOperativeTo === null);
      const activeNullTo = active.filter(a => a.awardOperativeTo === null);
      
      // All nullTo awards that are operative should be in active
      for (const award of nullToAwards) {
        if (award.awardOperativeFrom == null || award.awardOperativeFrom <= asOfDate) {
          expect(activeNullTo.some(a => a.awardCode === award.awardCode)).toBe(true);
        }
      }
    });

    it("excludes awards where awardOperativeTo is in the past", () => {
      const asOfDate = new Date("2025-07-15");
      const active = getActiveAwards(awards, asOfDate);
      
      // Awards with operativeTo < asOfDate should be excluded
      const expiredAwards = awards.filter(a => 
        a.awardOperativeTo != null && a.awardOperativeTo < asOfDate
      );
      
      for (const expired of expiredAwards) {
        expect(active.some(a => a.awardCode === expired.awardCode)).toBe(false);
      }
    });

    it("excludes awards where awardOperativeFrom is in the future", () => {
      const asOfDate = new Date("2025-07-15");
      const active = getActiveAwards(awards, asOfDate);
      
      // Awards with operativeFrom > asOfDate should be excluded
      const futureAwards = awards.filter(a => 
        a.awardOperativeFrom != null && a.awardOperativeFrom > asOfDate
      );
      
      for (const future of futureAwards) {
        expect(active.some(a => a.awardCode === future.awardCode)).toBe(false);
      }
    });

    it("includes awards active as of the given date", () => {
      const asOfDate = new Date("2025-07-15");
      const active = getActiveAwards(awards, asOfDate);
      
      // Verify MA000004 is active (assuming it's operative)
      const ma000004 = awardsByCode.get("MA000004");
      if (ma000004) {
        const isActive = (ma000004.awardOperativeFrom == null || ma000004.awardOperativeFrom <= asOfDate) &&
                        (ma000004.awardOperativeTo == null || ma000004.awardOperativeTo >= asOfDate);
        
        if (isActive) {
          expect(active.some(a => a.awardCode === "MA000004")).toBe(true);
        }
      }
    });

    it("defaults to today's date when asOfDate is not provided", () => {
      const today = new Date();
      const activeWithDate = getActiveAwards(awards, today);
      const activeDefault = getActiveAwards(awards);
      
      // Should return same results (allowing for millisecond differences)
      expect(activeWithDate.length).toBe(activeDefault.length);
    });
  });
});
