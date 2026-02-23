/**
 * Pure penalty-matching logic for testing and UI.
 */

/**
 * Whether a penalty row applies to the given award/classification/rate type selection.
 * @param {object} penalty - { awardCode, classification, classificationLevel, employeeRateTypeCode }
 * @param {object} selection - { awardCode, rateType, classification: { classification, classificationLevel } }
 */
export function penaltyMatchesSelection(
  penalty,
  { awardCode, rateType, classification }
) {
  if (!penalty) return false;
  if (penalty.awardCode !== awardCode) return false;

  const cls = classification?.classification || "";
  const level = classification?.classificationLevel || "";
  const penaltyCls = (penalty.classification || "").toLowerCase();
  const penaltyLevel = String(penalty.classificationLevel || "").trim();
  
  // STEP 4 FIX: Require BOTH classification AND classificationLevel to match
  // unless the penalty row has employeeRateTypeCode = "AD" (applies to all)
  // This prevents cross-contamination where Level 2 penalties match Level 1 queries
  const penaltyIsAD = (penalty.employeeRateTypeCode || "").toUpperCase() === "AD";
  
  let classificationMatches = false;
  
  if (penaltyIsAD) {
    // AD (applies to all) - only need classification name OR level to match
    if (cls && penaltyCls === cls.toLowerCase()) {
      classificationMatches = true;
    } else if (level && penaltyLevel === level.toString()) {
      classificationMatches = true;
    }
  } else {
    // Non-AD penalties: require BOTH classification name AND level to match
    const clsMatch = !cls || penaltyCls === cls.toLowerCase();
    const levelMatch = !level || penaltyLevel === level.toString();
    
    // If both are provided, both must match
    if (cls && level) {
      classificationMatches = clsMatch && levelMatch;
    } else if (cls) {
      // Only classification name provided - must match
      classificationMatches = clsMatch;
    } else if (level) {
      // Only level provided - must match
      classificationMatches = levelMatch;
    } else {
      // Neither provided - cannot match
      classificationMatches = false;
    }
  }
  
  if (!classificationMatches) return false;

  const pCode = penalty.employeeRateTypeCode || "";
  if (!rateType) return true;
  if (pCode && pCode !== rateType && pCode !== "AD") return false;
  return true;
}
