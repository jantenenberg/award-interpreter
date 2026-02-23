/**
 * Calculates allowance costs for a single shift.
 * Handles wage and expense allowances based on paymentFrequency and rateUnit.
 */

import { getDisplayRates } from "./rates.js";
import { STANDARD_HOURS_PER_WEEK } from "./rates.js";

/**
 * Resolve hourly rate for percentage-based allowances. Uses effectiveHourlyRate when provided (e.g. from
 * shift cost, including casual loading); otherwise derives from classification via getDisplayRates.
 */
function getHourlyRateForAllowance(classification, effectiveHourlyRate) {
  if (effectiveHourlyRate != null && effectiveHourlyRate > 0) {
    return effectiveHourlyRate;
  }
  const { calculatedValue, calculatedUnit, baseValue, baseUnit } =
    getDisplayRates(classification);
  return calculatedUnit === "hour" && calculatedValue != null
    ? calculatedValue
    : baseUnit === "hour" && baseValue != null
      ? baseValue
      : baseUnit === "week" && baseValue != null
        ? baseValue / STANDARD_HOURS_PER_WEEK
        : 0;
}

/**
 * Calculate cost for a single wage allowance for this shift.
 * @param {object} allowance - wage allowance object from CSV
 * @param {object} classification - classification object
 * @param {number} paidHours - paid hours in shift (after break deduction)
 * @param {number} [effectiveHourlyRate] - hourly rate to use for % allowances (e.g. from shift cost, includes casual loading)
 * @returns {number|null} cost in dollars, or null if not applicable
 */
export function calculateWageAllowanceCost(allowance, classification, paidHours, effectiveHourlyRate = null) {
  if (!allowance || !classification || paidHours <= 0) return null;

  const freq = (allowance.paymentFrequency || "").toLowerCase();
  const rateUnit = (allowance.rateUnit || "").toLowerCase();
  const rate = allowance.rate;
  const allowanceAmount = allowance.allowanceAmount;

  // Per hour / hourly
  if (
    freq.includes("hour") ||
    freq.includes("hourly") ||
    rateUnit.includes("hour")
  ) {
    // Prefer allowanceAmount if available (it's pre-calculated)
    if (allowanceAmount != null && allowanceAmount > 0) {
      return allowanceAmount * paidHours;
    }
    // Otherwise calculate from rate
    if (rate != null && rate > 0) {
      // If rateUnit is "Percent", calculate as percentage of base hourly rate
      if (rateUnit.includes("percent")) {
        const hourlyRate = getHourlyRateForAllowance(classification, effectiveHourlyRate);
        return (hourlyRate * rate / 100) * paidHours;
      }
      // Otherwise rate is dollar amount per hour
      return rate * paidHours;
    }
  }

  // Per shift / daily / per day or shift
  if (
    freq.includes("shift") ||
    freq.includes("day") ||
    freq.includes("per day") ||
    freq.includes("per shift") ||
    freq.includes("minimum payment")
  ) {
    // Prefer allowanceAmount if available (it's pre-calculated)
    if (allowanceAmount != null && allowanceAmount > 0) {
      return allowanceAmount;
    }
    // Otherwise calculate from rate
    if (rate != null && rate > 0) {
      // If percentage, calculate from base hourly (for one shift)
      if (rateUnit.includes("percent")) {
        const hourlyRate = getHourlyRateForAllowance(classification, effectiveHourlyRate);
        // For per-shift percentage, calculate based on standard shift hours (8)
        return (hourlyRate * rate / 100) * 8;
      }
      return rate;
    }
  }

  // Weekly / fortnightly / annual - pro-rate to shift (hours / 38)
  if (freq.includes("week") || freq.includes("fortnight") || freq.includes("annual")) {
    if (allowanceAmount != null && allowanceAmount > 0) {
      if (freq.includes("week")) {
        return (allowanceAmount / STANDARD_HOURS_PER_WEEK) * paidHours;
      }
      if (freq.includes("fortnight")) {
        return (allowanceAmount / (STANDARD_HOURS_PER_WEEK * 2)) * paidHours;
      }
      if (freq.includes("annual")) {
        return (allowanceAmount / (STANDARD_HOURS_PER_WEEK * 52)) * paidHours;
      }
    }
  }

  return null;
}

/**
 * Calculate cost for a single expense allowance for this shift.
 * @param {object} allowance - expense allowance object from CSV
 * @param {number} shiftKms - kilometres driven this shift (for per-km allowances)
 * @returns {number|null} cost in dollars, or null if not applicable
 */
export function calculateExpenseAllowanceCost(allowance, shiftKms = 0) {
  if (!allowance) return null;

  const freq = (allowance.paymentFrequency || "").toLowerCase();
  const amount = allowance.allowanceAmount;

  if (amount == null || amount <= 0) return null;

  // Per km
  if (freq.includes("km") || freq.includes("kilometre")) {
    return amount * (shiftKms || 0);
  }

  // Per shift / daily / per day or shift / per occasion
  if (
    freq.includes("shift") ||
    freq.includes("day") ||
    freq.includes("per day") ||
    freq.includes("per shift") ||
    freq.includes("occasion")
  ) {
    return amount;
  }

  // For each meal - assume 1 meal per shift (could be made configurable)
  if (freq.includes("meal") || freq.includes("for each meal")) {
    return amount;
  }

  // Weekly / fortnightly / annual - pro-rate to shift (hours / 38)
  // Note: This assumes we have paidHours, but expense allowances typically don't pro-rate
  // For now, we'll skip weekly/fortnightly/annual expense allowances at shift level
  // They're better handled at roster level

  return null;
}
