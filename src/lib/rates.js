/**
 * Pure rate and display logic for testing and UI.
 * Standard full-time week hours (Fair Work).
 */
export const STANDARD_HOURS_PER_WEEK = 38;

export function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return "";
  return `$${value.toFixed(2)}`;
}

/**
 * Casual loading percentage when calculated rate includes loading and base does not.
 * @returns {number|null} Percentage (e.g. 25) or null if not applicable
 */
export function calcCasualLoading(baseRate, calculatedRate) {
  if (!baseRate || !calculatedRate || baseRate === 0) return null;
  const pct = (calculatedRate / baseRate - 1) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return pct;
}

/**
 * Returns display values and units for base and calculated rate, respecting
 * baseRateType/calculatedRateType. When CSV has weekly base but no hourly
 * calculated rate (fallback used), derives hourly from weekly.
 * @param {object} classification - { baseRate, baseRateType, calculatedRate, calculatedRateType }
 * @returns {{ baseValue: number, baseUnit: string, calculatedValue: number, calculatedUnit: string }}
 */
export function getDisplayRates(classification) {
  const baseUnitRaw = (classification.baseRateType || "Hourly").toLowerCase();
  const baseUnit =
    baseUnitRaw === "hourly"
      ? "hour"
      : baseUnitRaw === "weekly"
        ? "week"
        : baseUnitRaw;
  const calcUnitRaw = (
    classification.calculatedRateType || "Hourly"
  ).toLowerCase();
  const calcUnit =
    calcUnitRaw === "hourly"
      ? "hour"
      : calcUnitRaw === "weekly"
        ? "week"
        : calcUnitRaw;

  const baseVal =
    classification.baseRate != null ? Number(classification.baseRate) : null;
  let calcVal =
    classification.calculatedRate != null
      ? Number(classification.calculatedRate)
      : null;
  let calcDisplayUnit = calcUnit;

  if (
    baseVal != null &&
    calcVal != null &&
    calcVal === baseVal &&
    baseUnitRaw === "weekly"
  ) {
    calcVal = baseVal / STANDARD_HOURS_PER_WEEK;
    calcDisplayUnit = "hour";
  }

  return {
    baseValue: baseVal,
    baseUnit,
    calculatedValue: calcVal,
    calculatedUnit: calcDisplayUnit,
  };
}

/**
 * Effective hourly rate when casual + weekly base and a loading % is applied (for display and consistency with shift cost).
 * @param {object} classification - { baseRate, baseRateType }
 * @param {number} casualLoadingPercent - e.g. 25
 * @returns {number|null} hourly rate (base/38)*(1+loading/100) or null if not applicable
 */
export function getEffectiveCasualHourly(classification, casualLoadingPercent) {
  if (!classification || casualLoadingPercent == null) return null;
  const baseUnit = (classification.baseRateType || "").toLowerCase();
  if (baseUnit !== "weekly") return null;
  const baseVal = classification.baseRate != null ? Number(classification.baseRate) : null;
  if (baseVal == null || baseVal <= 0) return null;
  const pct = Number(casualLoadingPercent) || 0;
  return (baseVal / STANDARD_HOURS_PER_WEEK) * (1 + pct / 100);
}
