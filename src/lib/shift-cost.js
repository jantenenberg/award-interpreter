/**
 * Single-shift cost calculation.
 * Splits a shift into segments by day type and time (e.g. Saturday first 2 hrs vs after),
 * applies applicable penalty rates from CSV, and returns total cost.
 */

import { getDisplayRates } from "./rates.js";
import { STANDARD_HOURS_PER_WEEK } from "./rates.js";
import {
  calculateWageAllowanceCost,
  calculateExpenseAllowanceCost,
} from "./allowance-cost.js";

/**
 * Expected multiplier ranges for MA000004 CA Level 1 penalty rates.
 * Used for validation and override when CSV data is incorrect.
 */
const EXPECTED_MULTIPLIER_RANGES = {
  ordinary: { min: 0.98, max: 1.02, expected: 1.00 },
  weekday_early_late: { min: 1.08, max: 1.12, expected: 1.10 },
  friday_late: { min: 1.13, max: 1.17, expected: 1.15 },
  saturday: { min: 1.23, max: 1.27, expected: 1.25 },
  saturday_ordinary: { min: 1.23, max: 1.27, expected: 1.25 },
  saturday_first_3: { min: 1.23, max: 1.27, expected: 1.25 }, // If exists for MA000004 CA L1, suspect
  saturday_after_3: { min: 1.23, max: 1.27, expected: 1.25 }, // If exists for MA000004 CA L1, suspect
  sunday: { min: 1.48, max: 1.52, expected: 1.50 },
  publicholiday: { min: 2.23, max: 2.27, expected: 2.25 },
};

/**
 * STEP 1: Diagnostic audit function for MA000004 CA Level 1 penalty rates.
 * Logs all penalty rates, their implied multipliers, and flags discrepancies.
 * @param {object[]} penalties - All penalty rows from CSV
 * @param {number} ordinaryHourlyRate - Base ordinary hourly rate
 * @param {object} classification - Classification object
 * @returns {Array} Audit results with warnings for discrepancies
 */
export function auditPenaltyRates(penalties, ordinaryHourlyRate, classification) {
  const auditResults = [];
  const isMA000004CALevel1 = classification && 
    (classification.awardCode || "").toUpperCase() === "MA000004" &&
    (classification.employeeRateTypeCode || "").toUpperCase() === "CA" &&
    String(classification.classificationLevel || "").trim() === "1";
  
  if (!isMA000004CALevel1 || ordinaryHourlyRate <= 0) {
    return auditResults;
  }
  
  // Track rates by key
  const ratesByKey = new Map();
  
  for (const p of penalties || []) {
    const key = penaltyKey(p.penaltyDescription);
    if (!key) continue;
    
    const csvRate = p.penaltyCalculatedValue != null && p.penaltyCalculatedValue > 0
      ? Number(p.penaltyCalculatedValue)
      : null;
    
    if (csvRate != null) {
      const impliedMultiplier = csvRate / ordinaryHourlyRate;
      const range = EXPECTED_MULTIPLIER_RANGES[key];
      
      ratesByKey.set(key, {
        key,
        csvRate,
        impliedMultiplier,
        expectedRange: range,
        penaltyRow: {
          description: p.penaltyDescription,
          employeeRateTypeCode: p.employeeRateTypeCode,
          classificationLevel: p.classificationLevel,
          classification: p.classification,
          rate: p.rate,
          penaltyRateUnit: p.penaltyRateUnit,
          penaltyCalculatedValue: p.penaltyCalculatedValue,
        },
      });
    }
  }
  
  // Check each key against expected ranges
  for (const [key, data] of ratesByKey.entries()) {
    const range = data.expectedRange;
    if (range) {
      const tolerance = 0.02;
      const discrepancy = Math.abs(data.impliedMultiplier - range.expected);
      
      if (data.impliedMultiplier < range.min - tolerance || data.impliedMultiplier > range.max + tolerance) {
        auditResults.push({
          key,
          severity: "DATA_QUALITY_WARNING",
          message: `Penalty key "${key}": CSV value $${data.csvRate.toFixed(2)} implies ×${data.impliedMultiplier.toFixed(4)}, expected ×${range.expected} (range: ${range.min}-${range.max})`,
          csvRate: data.csvRate,
          impliedMultiplier: data.impliedMultiplier,
          expectedMultiplier: range.expected,
          expectedRate: ordinaryHourlyRate * range.expected,
          discrepancy: discrepancy.toFixed(4),
          penaltyRow: data.penaltyRow,
        });
      }
    }
  }
  
  return auditResults;
}

// Load configuration overrides from localStorage (shared with data-loader.js)
function loadConfigurationOverrides() {
  // Handle test environment where localStorage may not exist
  if (typeof localStorage === 'undefined') {
    return { penaltyRates: new Map() };
  }
  
  const saved = localStorage.getItem('awardInterpreterConfig');
  if (saved) {
    try {
      const config = JSON.parse(saved);
      return {
        penaltyRates: new Map(config.overrides?.penaltyRates || []),
      };
    } catch (e) {
      console.warn('Error loading configuration overrides:', e);
    }
  }
  return {
    penaltyRates: new Map(),
  };
}

/** Normalize penalty description to a lookup key. Extracts "first X hours" from e.g. "Saturday - First 4 hours". */
function penaltyKey(penaltyDescription) {
  const d = (penaltyDescription || "").trim().toLowerCase();
  if (!d) return null;

  // Check for Saturday-specific penalties first (before generic "ordinary hours")
  const satFirst = d.match(/saturday[^a-z]*first[^a-z]*(\d+)[^a-z]*hour/i);
  if (satFirst) return `saturday_first_${satFirst[1]}`;
  const satAfter = d.match(/saturday[^a-z]*after[^a-z]*(\d+)[^a-z]*hour/i);
  if (satAfter) return `saturday_after_${satAfter[1]}`;
  // "Saturday - ordinary hours" should map to saturday_ordinary, not generic "ordinary"
  if (d.includes("saturday") && d.includes("ordinary hours")) return "saturday_ordinary";
  if (d.includes("saturday")) return "saturday"; // fallback for other Saturday penalties

  // Weekday time-of-day penalties
  if (d.includes("early") || d.includes("late") || d.includes("before 7") || d.includes("after 6")) {
    if (d.includes("friday") && (d.includes("late") || d.includes("after 6"))) return "friday_late";
    if (d.includes("friday") || d.includes("monday") || d.includes("tuesday") || d.includes("wednesday") || d.includes("thursday")) {
      return "weekday_early_late";
    }
  }

  // Only non-Saturday "ordinary hours" maps to generic "ordinary"
  if (d.includes("ordinary hours") && !d.includes("monday")) return "ordinary";
  if (d.includes("public holiday") || d.includes("publicholiday")) return "publicholiday";
  if (d.includes("sunday")) return "sunday";

  return null;
}

/** Build map of penaltyKey -> hourly rate ($) from penalty rows. Prefer penaltyCalculatedValue. */
function buildPenaltyRateMap(penalties, ordinaryHourlyRate, classification = null) {
  const m = new Map();
  const overrideFlags = new Map(); // Track which keys have overrides

  // Load configuration overrides
  const configOverrides = loadConfigurationOverrides();

  // Check if this is MA000004 CA Level 1 - tiered Saturday rates should be excluded
  // Fallback to penalties[0].awardCode if classification doesn't have awardCode
  const awardCodeForCheck = classification?.awardCode || (penalties && penalties.length > 0 ? penalties[0].awardCode : null);
  const isMA000004CALevel1 = classification && awardCodeForCheck &&
    awardCodeForCheck.toUpperCase() === "MA000004" &&
    (classification.employeeRateTypeCode || "").toUpperCase() === "CA" &&
    String(classification.classificationLevel || "").trim() === "1";
  
  if (isMA000004CALevel1) {
    console.log('[buildPenaltyRateMap] MA000004 CA Level 1 detected - will exclude tiered Saturday rates', {
      awardCode: awardCodeForCheck,
      employeeRateTypeCode: classification.employeeRateTypeCode,
      classificationLevel: classification.classificationLevel
    });
  }

  for (const p of penalties || []) {
    const key = penaltyKey(p.penaltyDescription);
    if (!key) continue;

    // CRITICAL FIX: Exclude tiered Saturday rows for MA000004 CA Level 1
    // MA000004 Casual Level 1 uses a flat ×1.25 Saturday rate, not tiered rates
    if (isMA000004CALevel1 && (key.startsWith("saturday_first_") || key.startsWith("saturday_after_"))) {
      console.log(`[buildPenaltyRateMap] Skipping tiered Saturday rate: ${key} for MA000004 CA Level 1`);
      continue; // Skip tiered Saturday rows for this classification
    }

    // Check for override first (try multiple key formats)
    const overrideKey1 = `${p.awardCode || ''}|${p.classification || ''}|${p.penaltyDescription || ''}`;
    const overrideKey2 = `${p.awardCode || ''}|${p.classification || ''}|${(p.penaltyDescription || '').toLowerCase()}`;
    let overrideRate = configOverrides.penaltyRates.get(overrideKey1);
    if (overrideRate === undefined) {
      overrideRate = configOverrides.penaltyRates.get(overrideKey2);
    }
    
    let rate = null;
    let rateSource = null; // Track where rate came from for audit
    if (overrideRate !== undefined) {
      // Use override rate (user configuration override)
      rate = overrideRate;
      rateSource = "user_override";
      overrideFlags.set(key, true);
    } else if (p.isOverride) {
      // Penalty already has override applied from data-loader
      rate = p.penaltyCalculatedValue;
      rateSource = "data_loader_override";
      overrideFlags.set(key, true);
    } else if (p.penaltyCalculatedValue != null && p.penaltyCalculatedValue > 0) {
      // Prefer penaltyCalculatedValue (pre-calculated hourly rate in dollars)
      rate = Number(p.penaltyCalculatedValue);
      rateSource = "csv_penaltyCalculatedValue";
    } else if (
      p.rate != null &&
      (p.penaltyRateUnit || "").toLowerCase().includes("percent") &&
      ordinaryHourlyRate > 0
    ) {
      // If percentage: ordinaryHourlyRate × (rate ÷ 100)
      rate = ordinaryHourlyRate * (Number(p.rate) / 100);
      rateSource = "csv_percentage";
    } else if (p.rate != null && p.rate > 0) {
      // If dollar amount: use rate directly
      rate = Number(p.rate);
      rateSource = "csv_dollar_amount";
    }
    
    // STEP 2: Multiplier validation layer for MA000004 CA Level 1
    if (rate != null && rate > 0 && isMA000004CALevel1 && ordinaryHourlyRate > 0) {
      const range = EXPECTED_MULTIPLIER_RANGES[key];
      if (range) {
        const impliedMultiplier = rate / ordinaryHourlyRate;
        const tolerance = 0.02;
        
        // Check if multiplier is outside expected range
        if (impliedMultiplier < range.min - tolerance || impliedMultiplier > range.max + tolerance) {
          // DATA QUALITY WARNING: CSV value implies incorrect multiplier
          const expectedRate = ordinaryHourlyRate * range.expected;
          
          // Store audit info for warnings
          if (!m._auditWarnings) {
            m._auditWarnings = [];
          }
          m._auditWarnings.push({
            key,
            csvRate: rate,
            impliedMultiplier: impliedMultiplier.toFixed(4),
            expectedMultiplier: range.expected,
            expectedRate: expectedRate,
            penaltyRow: {
              description: p.penaltyDescription,
              employeeRateTypeCode: p.employeeRateTypeCode,
              classificationLevel: p.classificationLevel,
              classification: p.classification,
              rate: p.rate,
              penaltyRateUnit: p.penaltyRateUnit,
              penaltyCalculatedValue: p.penaltyCalculatedValue,
            },
          });
          
          // Override with calculated rate
          rate = expectedRate;
          rateSource = "multiplier_validation_override";
        }
      }
    }
    
    if (rate != null && rate > 0) {
      // Overrides take precedence - if this is an override, replace existing value
      if (overrideFlags.get(key) || !m.has(key)) {
        m.set(key, rate);
        // Store rate source for audit
        if (!m._rateSources) {
          m._rateSources = new Map();
        }
        m._rateSources.set(key, rateSource);
      }
    }
  }

  // Store override flags for validation
  m._overrideFlags = overrideFlags;
  return m;
}

/** Get effective ordinary-hourly rate from classification. */
function getOrdinaryHourlyRate(classification, penaltyRateMap) {
  const { calculatedValue, calculatedUnit, baseValue, baseUnit } = getDisplayRates(
    classification || {}
  );
  if (calculatedUnit === "hour" && calculatedValue != null) return calculatedValue;
  if (baseUnit === "hour" && baseValue != null) return baseValue;
  if (baseUnit === "week" && baseValue != null) {
    return baseValue / STANDARD_HOURS_PER_WEEK;
  }
  return penaltyRateMap.get("ordinary") || 0;
}

/**
 * Determine base penalty key for a given moment (date + time) without overtime.
 * @param {Date} dt - moment in time
 * @param {Set<string>} publicHolidays - YYYY-MM-DD dates
 * @param {Map<string,number>} penaltyRateMap - penalty rate map
 * @param {number} hoursWorkedInShift - hours worked so far in this shift
 * @returns {string} base penalty key
 */
function getBasePenaltyKeyForMoment(dt, publicHolidays, penaltyRateMap, hoursWorkedInShift = 0) {
  const ymd =
    dt.getFullYear() +
    "-" +
    String(dt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getDate()).padStart(2, "0");
  const dow = dt.getDay();
  const hour = dt.getHours() + dt.getMinutes() / 60;

  if (publicHolidays && publicHolidays.has(ymd)) return "publicholiday";
  if (dow === 0) return "sunday";
  
  if (dow === 6) {
    // Saturday logic
    // CRITICAL FIX: For MA000004 CA Level 1, prioritize saturday_ordinary over tiered rates
    // Check for flat Saturday rate first (this is set explicitly for MA000004 CA Level 1)
    if (penaltyRateMap.has("saturday_ordinary")) {
      return "saturday_ordinary";
    }
    if (penaltyRateMap.has("saturday")) {
      return "saturday";
    }
    // Only check for tiered rates if flat rate doesn't exist (for other awards)
    for (const k of penaltyRateMap.keys()) {
      const m = k.match(/^saturday_first_(\d+)$/);
      if (m) {
        const cap = parseInt(m[1], 10);
        if (hoursWorkedInShift < cap) return k;
      }
    }
    for (const k of penaltyRateMap.keys()) {
      if (k.startsWith("saturday_after_")) return k;
    }
    return "ordinary";
  }

  // Weekday (Mon-Fri) time-of-day logic
  if (dow >= 1 && dow <= 5) {
    if (hour < 7) {
      // Before 7am
      return penaltyRateMap.has("weekday_early_late") ? "weekday_early_late" : "ordinary";
    } else if (hour >= 7 && hour < 18) {
      // 7am-6pm
      return "ordinary";
    } else {
      // After 6pm
      if (dow === 5) {
        // Friday
        return penaltyRateMap.has("friday_late") ? "friday_late" : 
               (penaltyRateMap.has("weekday_early_late") ? "weekday_early_late" : "ordinary");
      } else {
        // Mon-Thu
        return penaltyRateMap.has("weekday_early_late") ? "weekday_early_late" : "ordinary";
      }
    }
  }

  return "ordinary";
}

/**
 * Calculate shift cost. Splits shift into segments and applies penalty rates.
 *
 * @param {object} params
 * @param {string} params.date - YYYY-MM-DD (shift start date)
 * @param {string} params.startTime - HH:mm (24h)
 * @param {number} params.durationHours - total shift length in hours (supports multi-day)
 * @param {number} params.breakMinutes - unpaid break
 * @param {object} params.classification - classification row from CSV (baseRate, calculatedRate, etc.)
 * @param {object[]} params.penalties - applicable penalty rows (matching award/classification/rate type)
 * @param {object[]} [params.wageAllowances] - selected wage allowance objects from CSV
 * @param {object[]} [params.expenseAllowances] - selected expense allowance objects from CSV
 * @param {number} [params.shiftKms] - kilometres driven for per-km expense allowances
 * @param {string[]} [params.publicHolidays] - optional YYYY-MM-DD dates
 * @param {number} [params.casualLoadingPercent] - casual loading percentage (e.g. 25). Used when converting weekly base to hourly for CA. Default 25.
 * @param {boolean} [params.useCasualLoadingForRate] - if true, for casual with weekly base use (base/38)*(1+loading%/100) instead of CSV calculated rate
 * @returns {{ segments: Array<{ description: string, hours: number, ratePerHour: number, cost: number }>, wageAllowances: Array<{ description: string, cost: number }>, expenseAllowances: Array<{ description: string, cost: number }>, totalCost: number, totalHours: number, warnings: string[], error?: string }}
 */
export function calculateShiftCost({
  date,
  startTime,
  durationHours,
  breakMinutes = 0,
  classification,
  penalties,
  wageAllowances = [],
  expenseAllowances = [],
  shiftKms = 0,
  publicHolidays = [],
  casualLoadingPercent = 25,
  useCasualLoadingForRate = false,
}) {
  const warnings = [];

  if (!date || !startTime || durationHours == null || durationHours <= 0 || !classification) {
    return {
      segments: [],
      totalCost: 0,
      totalHours: 0,
      warnings: [],
      error: "Missing date, start time, duration, or classification.",
    };
  }

  const phSet = new Set(Array.isArray(publicHolidays) ? publicHolidays : []);
  const isCasual = (classification.employeeRateTypeCode || "").toUpperCase() === "CA";

  // Ordinary hourly rate: use casualLoadingPercent when useCasualLoadingPercent is true (casual + weekly base)
  const ordinaryRate = getDisplayRates(classification).calculatedValue;
  const baseRate = getDisplayRates(classification).baseValue;
  let ordinaryHourly = 0;
  const pct = Number(casualLoadingPercent);
  const loadingMultiplier = 1 + (Number.isNaN(pct) ? 25 : pct) / 100; // allow 0%; default 25 only when missing/NaN
  const hasWeeklyBase = (classification.baseRateType || "").toLowerCase() === "weekly" && baseRate != null;

  // When UI passes useCasualLoadingForRate (user selected Casual + weekly base), apply loading regardless of
  // classification.employeeRateTypeCode (e.g. "AD" row is used when no dedicated CA row exists).
  if (useCasualLoadingForRate && hasWeeklyBase) {
    ordinaryHourly = (baseRate / STANDARD_HOURS_PER_WEEK) * loadingMultiplier;
  } else if ((classification.calculatedRateType || "").toLowerCase() === "hourly" && ordinaryRate != null) {
    ordinaryHourly = ordinaryRate;
  } else if (hasWeeklyBase) {
    if (isCasual) {
      ordinaryHourly = (baseRate / STANDARD_HOURS_PER_WEEK) * loadingMultiplier;
    } else {
      ordinaryHourly = baseRate / STANDARD_HOURS_PER_WEEK;
    }
  } else if (ordinaryRate != null) {
    ordinaryHourly = ordinaryRate;
  }

  const penaltyRateMap = buildPenaltyRateMap(penalties, ordinaryHourly, classification);
  
  // STEP 1 & 2: Add audit warnings from multiplier validation
  if (penaltyRateMap._auditWarnings && penaltyRateMap._auditWarnings.length > 0) {
    for (const audit of penaltyRateMap._auditWarnings) {
      warnings.push(
        `Rate override applied for ${audit.key}: CSV value $${audit.csvRate.toFixed(2)} implies ×${audit.impliedMultiplier} which is outside expected range (${EXPECTED_MULTIPLIER_RANGES[audit.key]?.min}-${EXPECTED_MULTIPLIER_RANGES[audit.key]?.max}). Using calculated rate $${audit.expectedRate.toFixed(2)} instead. ` +
        `Source row: ${audit.penaltyRow.description || 'N/A'} (${audit.penaltyRow.employeeRateTypeCode || 'N/A'}, Level ${audit.penaltyRow.classificationLevel || 'N/A'})`
      );
    }
  }
  
  // Build weekday time-of-day rates if not in penalty map
  if (!penaltyRateMap.has("weekday_early_late")) {
    penaltyRateMap.set("weekday_early_late", ordinaryHourly * 1.10);
  }
  if (!penaltyRateMap.has("friday_late")) {
    penaltyRateMap.set("friday_late", ordinaryHourly * 1.15);
  }
  if (!penaltyRateMap.has("ordinary")) {
    penaltyRateMap.set("ordinary", ordinaryHourly);
  }

  // STEP 3: Enhanced Saturday tiered structure validation for MA000004 CA Level 1
  // Check classification fields - also check penalties for awardCode if classification doesn't have it
  const awardCodeFromClassification = classification.awardCode || (penalties && penalties.length > 0 ? penalties[0].awardCode : null);
  const isMA000004CALevel1 = awardCodeFromClassification && 
    awardCodeFromClassification.toUpperCase() === "MA000004" &&
    (classification.employeeRateTypeCode || "").toUpperCase() === "CA" &&
    String(classification.classificationLevel || "").trim() === "1";
  
  if (isMA000004CALevel1) {
    console.log('[MA000004 CA Level 1] Applying Saturday flat rate fix - removing tiered rates', {
      awardCode: awardCodeFromClassification,
      employeeRateTypeCode: classification.employeeRateTypeCode,
      classificationLevel: classification.classificationLevel
    });
    const hasSaturdayFirst3 = penaltyRateMap.has("saturday_first_3");
    const hasSaturdayAfter3 = penaltyRateMap.has("saturday_after_3");
    
    if (hasSaturdayFirst3 || hasSaturdayAfter3) {
      console.log('[MA000004 CA Level 1] Found tiered Saturday rates - removing them', {
        hasSaturdayFirst3,
        hasSaturdayAfter3,
        first3Rate: hasSaturdayFirst3 ? penaltyRateMap.get("saturday_first_3") : null,
        after3Rate: hasSaturdayAfter3 ? penaltyRateMap.get("saturday_after_3") : null
      });
    } else {
      console.log('[MA000004 CA Level 1] No tiered Saturday rates found in map (good)');
    }
    
    // Check if tiered Saturday rates exist and are outside flat Saturday range
    if (hasSaturdayFirst3 && hasSaturdayAfter3 && ordinaryHourly > 0) {
      const first3Rate = penaltyRateMap.get("saturday_first_3");
      const after3Rate = penaltyRateMap.get("saturday_after_3");
      const first3Multiplier = first3Rate / ordinaryHourly;
      const after3Multiplier = after3Rate / ordinaryHourly;
      const saturdayRange = EXPECTED_MULTIPLIER_RANGES.saturday_ordinary;
      
      // If both imply multipliers outside flat Saturday range, discard tiered structure
      if (
        (first3Multiplier < saturdayRange.min - 0.02 || first3Multiplier > saturdayRange.max + 0.02) ||
        (after3Multiplier < saturdayRange.min - 0.02 || after3Multiplier > saturdayRange.max + 0.02)
      ) {
        warnings.push(
          `DATA QUALITY WARNING: Tiered Saturday rates found for MA000004 CA Level 1 but both imply multipliers outside flat Saturday range (${saturdayRange.min}-${saturdayRange.max}). ` +
          `First 3 hours: $${first3Rate.toFixed(2)} (×${first3Multiplier.toFixed(4)}), After 3 hours: $${after3Rate.toFixed(2)} (×${after3Multiplier.toFixed(4)}). ` +
          `Discarding tiered structure and using flat ×1.25 rate for all Saturday hours.`
        );
        
        // Remove tiered Saturday rates
        penaltyRateMap.delete("saturday_first_3");
        penaltyRateMap.delete("saturday_after_3");
      }
    }
    
    // Remove any remaining tiered Saturday rates
    for (const key of Array.from(penaltyRateMap.keys())) {
      if (key.startsWith("saturday_first_") || key.startsWith("saturday_after_")) {
        penaltyRateMap.delete(key);
      }
    }
    
    // Ensure flat Saturday rate exists and is correct (×1.25 on casual loaded rate)
    const correctSaturdayRate = ordinaryHourly * 1.25;
    penaltyRateMap.set("saturday_ordinary", correctSaturdayRate);
    console.log(`[MA000004 CA Level 1] Set flat Saturday rate: $${correctSaturdayRate.toFixed(2)}/hr (${ordinaryHourly.toFixed(2)} × 1.25)`);
    // Also set generic "saturday" key if it doesn't exist, but prefer "saturday_ordinary"
    if (!penaltyRateMap.has("saturday")) {
      penaltyRateMap.set("saturday", correctSaturdayRate);
    }
  }

  // When using casual loading % for the ordinary rate, CSV penalty rates (e.g. Sunday) are based on unloaded rate.
  // Override Sunday to ordinaryHourly × 1.50 so calculations and validation are consistent.
  if (useCasualLoadingForRate && ordinaryHourly > 0) {
    penaltyRateMap.set("sunday", ordinaryHourly * 1.50);
  }

  // BUG 4: Verify Saturday penalty rates
  const hasSaturdayTiered = penaltyRateMap.has("saturday_first_3") || penaltyRateMap.has("saturday_after_3");
  const hasSaturdayOrdinary = penaltyRateMap.has("saturday_ordinary");
  const hasSaturdayGeneric = penaltyRateMap.has("saturday");
  
  // BUG 5: Validate Sunday rate (should be ×1.50)
  // Only warn if no override exists (user has already fixed it via configuration)
  if (penaltyRateMap.has("sunday")) {
    const hasOverride = penaltyRateMap._overrideFlags?.get("sunday");
    if (!hasOverride) {
      const sundayRate = penaltyRateMap.get("sunday");
      const expectedSundayRate = ordinaryHourly * 1.50;
      const tolerance = 0.01; // Allow small rounding differences
      if (Math.abs(sundayRate - expectedSundayRate) > tolerance) {
        warnings.push(`Sunday rate validation: Expected ${expectedSundayRate.toFixed(2)}/hr (×1.50) but found ${sundayRate.toFixed(2)}/hr. Please verify MAP CSV data or use Configuration page to override.`);
      }
    }
  }

  // Validate Saturday rate consistency
  // Only warn if no overrides exist
  if (hasSaturdayOrdinary) {
    const hasSatOverride = penaltyRateMap._overrideFlags?.get("saturday_ordinary");
    if (!hasSatOverride) {
      const satOrdinaryRate = penaltyRateMap.get("saturday_ordinary");
      if (penaltyRateMap.has("sunday")) {
        const hasSunOverride = penaltyRateMap._overrideFlags?.get("sunday");
        if (!hasSunOverride) {
          const sundayRate = penaltyRateMap.get("sunday");
          if (satOrdinaryRate > sundayRate) {
            warnings.push(`Saturday ordinary rate (${satOrdinaryRate.toFixed(2)}/hr) exceeds Sunday rate (${sundayRate.toFixed(2)}/hr). Please verify MAP CSV data or use Configuration page to override.`);
          }
        }
      }
    }
  }

  const start = new Date(date + "T" + (startTime || "00:00") + ":00");
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  if (end.getTime() <= start.getTime()) {
    return { segments: [], totalCost: 0, totalHours: 0, warnings: [] };
  }

  const breakMs = (breakMinutes || 0) * 60 * 1000;
  const rawMs = end - start - breakMs;
  if (rawMs <= 0) {
    return { segments: [], totalCost: 0, totalHours: 0, warnings: [] };
  }
  let totalHours = rawMs / (60 * 60 * 1000);

  // BUG 3: Casual minimum engagement (3 hours minimum)
  const originalTotalHours = totalHours;
  if (isCasual && totalHours < 3) {
    totalHours = 3;
    warnings.push(`Minimum casual engagement of 3 hours applied (actual hours: ${originalTotalHours.toFixed(2)})`);
  }

  const INCREMENT_MS = 6 * 60 * 1000;
  const segmentAccum = new Map();

  // Track overtime per day (date string -> hours worked that day)
  const dailyHoursWorked = new Map();
  
  let t = start.getTime();
  const endT = end.getTime();
  let breakRemaining = breakMs;
  let hoursWorkedInShift = 0;

  while (t < endT) {
    const step = Math.min(INCREMENT_MS, endT - t);
    if (breakRemaining > 0) {
      const useBreak = Math.min(step, breakRemaining);
      breakRemaining -= useBreak;
      t += step;
      continue;
    }

    const dt = new Date(t);
    const ymd =
      dt.getFullYear() +
      "-" +
      String(dt.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(dt.getDate()).padStart(2, "0");
    
    const hours = step / (60 * 60 * 1000);
    
    // Track daily hours for overtime calculation (before adding current hours)
    if (!dailyHoursWorked.has(ymd)) {
      dailyHoursWorked.set(ymd, 0);
    }
    const hoursWorkedTodayBefore = dailyHoursWorked.get(ymd);
    
    // Get base penalty key (time-of-day, day type)
    const baseKey = getBasePenaltyKeyForMoment(dt, phSet, penaltyRateMap, hoursWorkedInShift);
    
    // Calculate time-of-day multiplier based on baseKey
    let timeOfDayMultiplier = 1.0;
    if (baseKey === "weekday_early_late") {
      timeOfDayMultiplier = 1.10;
    } else if (baseKey === "friday_late") {
      timeOfDayMultiplier = 1.15;
    }
    // For "ordinary", "sunday", "saturday_ordinary", etc., multiplier stays 1.0
    
    // BUG 2: Apply overtime multipliers for weekdays (Mon-Fri)
    // Overtime multipliers apply to casual loaded rate, then time-of-day penalty on top
    const dow = dt.getDay();
    let overtimeMultiplier = 1.0;
    if (dow >= 1 && dow <= 5 && baseKey !== "publicholiday" && baseKey !== "sunday") {
      const maxOrdinaryHours = 9;
      // Check if we're already in overtime before this segment
      if (hoursWorkedTodayBefore >= maxOrdinaryHours) {
        const overtimeHours = hoursWorkedTodayBefore - maxOrdinaryHours;
        if (overtimeHours < 3) {
          // First 3 hours of overtime
          overtimeMultiplier = 1.50;
        } else {
          // Beyond 3 hours of overtime
          overtimeMultiplier = 2.00;
        }
      }
    }
    
    // Final rate = casual loaded rate × time-of-day multiplier × overtime multiplier
    // Note: For non-weekday penalties (Saturday, Sunday, Public holiday), use penalty map rate directly
    let finalRate;
    if (baseKey === "sunday" || baseKey === "publicholiday" || baseKey.startsWith("saturday")) {
      // Use penalty map rate directly for weekends/holidays (no overtime)
      finalRate = penaltyRateMap.get(baseKey) ?? ordinaryHourly;
    } else {
      // Weekday: apply time-of-day and overtime multipliers to casual loaded rate
      finalRate = ordinaryHourly * timeOfDayMultiplier * overtimeMultiplier;
    }
    
    // Create segment key that includes overtime info
    let segmentKey = baseKey;
    if (overtimeMultiplier > 1.0) {
      segmentKey = `${baseKey}_ot_${overtimeMultiplier === 1.50 ? 'first3' : 'beyond3'}`;
    }

    if (!segmentAccum.has(segmentKey)) {
      segmentAccum.set(segmentKey, { key: segmentKey, baseKey, overtimeMultiplier, hours: 0, rate: finalRate, cost: 0 });
    }
    const seg = segmentAccum.get(segmentKey);
    seg.hours += hours;
    seg.cost += hours * finalRate;

    hoursWorkedInShift += hours;
    dailyHoursWorked.set(ymd, hoursWorkedTodayBefore + hours);
    t += step;
  }

  // FIX 1: Adjust for minimum engagement padding (use shift's day-type rate, not always ordinary)
  if (isCasual && originalTotalHours < 3) {
    const paddingHours = 3 - originalTotalHours;
    
    // Determine the day type of the shift start to use appropriate rate for padding
    const startDow = start.getDay();
    const startYmd =
      start.getFullYear() +
      "-" +
      String(start.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(start.getDate()).padStart(2, "0");
    
    let paddingBaseKey = "ordinary";
    let paddingRate = ordinaryHourly;
    
    // Check if start date is a public holiday
    if (phSet.has(startYmd)) {
      paddingBaseKey = "publicholiday";
      paddingRate = penaltyRateMap.get("publicholiday") ?? ordinaryHourly;
    } else if (startDow === 0) {
      // Sunday
      paddingBaseKey = "sunday";
      paddingRate = penaltyRateMap.get("sunday") ?? ordinaryHourly;
    } else if (startDow === 6) {
      // Saturday - check for Saturday ordinary or tiered rates
      if (penaltyRateMap.has("saturday_ordinary")) {
        paddingBaseKey = "saturday_ordinary";
        paddingRate = penaltyRateMap.get("saturday_ordinary");
      } else if (penaltyRateMap.has("saturday")) {
        paddingBaseKey = "saturday";
        paddingRate = penaltyRateMap.get("saturday");
      } else {
        // Fallback to ordinary if no Saturday rate found
        paddingBaseKey = "ordinary";
        paddingRate = ordinaryHourly;
      }
    } else {
      // Weekday - use ordinary rate
      paddingBaseKey = "ordinary";
      paddingRate = ordinaryHourly;
    }
    
    const paddingCost = paddingHours * paddingRate;
    if (!segmentAccum.has("minimum_engagement_padding")) {
      segmentAccum.set("minimum_engagement_padding", {
        key: "minimum_engagement_padding",
        baseKey: paddingBaseKey,
        overtimeMultiplier: 1.0,
        hours: 0,
        rate: paddingRate,
        cost: 0,
      });
    }
    const paddingSeg = segmentAccum.get("minimum_engagement_padding");
    paddingSeg.hours += paddingHours;
    paddingSeg.cost += paddingCost;
  }

  const keyToDescription = (k, baseKey, overtimeMultiplier) => {
    if (k === "minimum_engagement_padding") {
      // Use the baseKey from the padding segment to show correct day type
      if (baseKey === "sunday") return "Minimum engagement padding (Sunday rate)";
      if (baseKey === "publicholiday") return "Minimum engagement padding (Public holiday rate)";
      if (baseKey.startsWith("saturday")) return "Minimum engagement padding (Saturday rate)";
      return "Minimum engagement padding";
    }
    
    let desc = "";
    if (baseKey === "ordinary") desc = "Ordinary hours";
    else if (baseKey === "sunday") desc = "Sunday";
    else if (baseKey === "publicholiday") desc = "Public holiday";
    else if (baseKey === "saturday_ordinary") desc = "Saturday - ordinary hours";
    else if (baseKey === "weekday_early_late") desc = "Weekday early/late";
    else if (baseKey === "friday_late") desc = "Friday late";
    else {
      const m1 = baseKey.match(/^saturday_first_(\d+)$/);
      if (m1) {
        desc = `Saturday – first ${m1[1]} hours`;
      } else {
        const m2 = baseKey.match(/^saturday_after_(\d+)$/);
        if (m2) {
          desc = `Saturday – after ${m2[1]} hours`;
        } else if (baseKey === "saturday") {
          desc = "Saturday";
        } else {
          desc = baseKey;
        }
      }
    }
    
    if (overtimeMultiplier > 1.0) {
      if (overtimeMultiplier === 1.50) {
        desc += " (overtime - first 3 hours)";
      } else if (overtimeMultiplier === 2.00) {
        desc += " (overtime - beyond 3 hours)";
      }
    }
    
    return desc;
  };

  const segments = Array.from(segmentAccum.values()).map((s) => ({
    description: keyToDescription(s.key, s.baseKey, s.overtimeMultiplier),
    hours: Math.round(s.hours * 10000) / 10000,
    ratePerHour: Math.round(s.rate * 100) / 100,
    cost: Math.round(s.cost * 100) / 100,
  }));

  const segmentCost = Math.round(
    segments.reduce((a, s) => a + s.cost, 0) * 100
  ) / 100;

  // Calculate wage allowances (use original totalHours; pass ordinaryHourly so % allowances use same rate as shift, including casual loading)
  const wageAllowanceItems = [];
  for (const allowance of wageAllowances || []) {
    const cost = calculateWageAllowanceCost(allowance, classification, totalHours, ordinaryHourly);
    if (cost != null && cost > 0) {
      wageAllowanceItems.push({
        description: allowance.allowance || "Wage allowance",
        cost: Math.round(cost * 100) / 100,
      });
    }
  }

  // Calculate expense allowances
  const expenseAllowanceItems = [];
  for (const allowance of expenseAllowances || []) {
    const cost = calculateExpenseAllowanceCost(allowance, shiftKms);
    if (cost != null && cost > 0) {
      expenseAllowanceItems.push({
        description: allowance.allowance || "Expense allowance",
        cost: Math.round(cost * 100) / 100,
      });
    }
  }

  const allowanceCost =
    Math.round(
      (wageAllowanceItems.reduce((a, w) => a + w.cost, 0) +
        expenseAllowanceItems.reduce((a, e) => a + e.cost, 0)) *
        100
    ) / 100;

  const totalCost = Math.round((segmentCost + allowanceCost) * 100) / 100;

  return {
    segments,
    wageAllowances: wageAllowanceItems,
    expenseAllowances: expenseAllowanceItems,
    totalCost,
    totalHours: Math.round(totalHours * 10000) / 10000,
    warnings,
  };
}

/**
 * Calculate cost for a roster of shifts.
 *
 * @param {object} params
 * @param {Array<{ date: string, startTime: string, durationHours: number, breakMinutes?: number, shiftKms?: number }>} params.shifts - array of shift definitions
 * @param {object} params.classification - classification row from CSV
 * @param {object[]} params.penalties - applicable penalty rows
 * @param {object[]} [params.wageAllowances] - selected wage allowance objects
 * @param {object[]} [params.expenseAllowances] - selected expense allowance objects
 * @param {string[]} [params.publicHolidays] - optional YYYY-MM-DD dates
 * @param {number} [params.casualLoadingPercent] - casual loading % (e.g. 25) for weekly→hourly conversion for CA
 * @param {boolean} [params.useCasualLoadingForRate] - if true, for casual with weekly base use (base/38)*(1+loading%/100) for calculations
 * @returns {{ shifts: Array<{ shift: object, result: object }>, totalCost: number, totalHours: number, warnings: string[] }}
 */
export function calculateRosterCost({
  shifts = [],
  classification,
  penalties,
  wageAllowances = [],
  expenseAllowances = [],
  publicHolidays = [],
  casualLoadingPercent = 25,
  useCasualLoadingForRate = false,
}) {
  const shiftResults = [];
  let totalCost = 0;
  let totalHours = 0;
  const allWarnings = [];

  for (const shift of shifts) {
    const r = calculateShiftCost({
      date: shift.date,
      startTime: shift.startTime || "09:00",
      durationHours: shift.durationHours,
      breakMinutes: shift.breakMinutes ?? 0,
      classification,
      penalties,
      casualLoadingPercent,
      useCasualLoadingForRate,
      wageAllowances,
      expenseAllowances,
      shiftKms: shift.shiftKms ?? 0,
      publicHolidays,
    });
    shiftResults.push({ shift, result: r });
    totalCost += r.totalCost || 0;
    totalHours += r.totalHours || 0;
    if (r.warnings && r.warnings.length > 0) {
      allWarnings.push(...r.warnings);
    }
  }

  return {
    shifts: shiftResults,
    totalCost: Math.round(totalCost * 100) / 100,
    totalHours: Math.round(totalHours * 10000) / 10000,
    warnings: allWarnings,
  };
}