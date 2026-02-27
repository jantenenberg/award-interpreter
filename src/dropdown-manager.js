// dropdown-manager.js
// Handles cascading dropdown behaviour using the indexed data from data-loader.js

import { subscribeToData, getDataIndexes } from "./data-loader.js";
import { updateBaseRateDisplay, updatePenaltyDisplay, updateAllowancesDisplay } from "./rate-display.js";

const awardSearchInput = document.getElementById("awardSearch");
const awardSelect = document.getElementById("awardSelect");
const rateTypeSelect = document.getElementById("rateTypeSelect");
const classificationSelect = document.getElementById("classificationSelect");
const yearSelect = document.getElementById("yearSelect");

const awardOptionsCount = document.getElementById("award-options-count");
const badgeAwardsCount = document.getElementById("badge-awards-count");
const classificationOptionsCount = document.getElementById("classification-options-count");
const badgeClassificationsCount = document.getElementById("badge-classifications-count");

const awardFixedIdField = document.getElementById("awardFixedId");
const classificationFixedIdField = document.getElementById("classificationFixedId");
const classificationLevelField = document.getElementById("classificationLevel");
const parentClassificationNameField = document.getElementById("parentClassificationName");
const baseRateField = document.getElementById("baseRateField");
const calculatedRateField = document.getElementById("calculatedRateField");
const baseRateTypeField = document.getElementById("baseRateTypeField");
const calculatedRateTypeField = document.getElementById("calculatedRateTypeField");

function setDisabledWhileLoading(loaded, error) {
  const disabled = !loaded || !!error;
  if (awardSearchInput) awardSearchInput.disabled = disabled;
  if (awardSelect) awardSelect.disabled = disabled;
  if (rateTypeSelect) rateTypeSelect.disabled = disabled || !awardSelect.value;
  if (classificationSelect)
    classificationSelect.disabled =
      disabled || !awardSelect.value || !rateTypeSelect.value;
}

function populateAwardsFromData() {
  const { awardsByCode, loaded, error } = getDataIndexes();
  setDisabledWhileLoading(loaded, error);

  if (!awardSelect || !awardSearchInput) return;

  // Clear existing options
  awardSelect.innerHTML = "";

  if (error) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Error loading awards – check CSV files.";
    awardSelect.appendChild(opt);
    if (badgeAwardsCount) {
      badgeAwardsCount.innerHTML =
        '<span class="badge-dot"></span><span>Error loading awards</span>';
    }
    return;
  }

  // Sort awards by code
  const awards = Array.from(awardsByCode.values()).sort((a, b) =>
    (a.awardCode || "").localeCompare(b.awardCode || "")
  );

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = awards.length
    ? `Select award (${awards.length} total)`
    : "Loading from Reference Tables";
  awardSelect.appendChild(placeholder);

  for (const award of awards) {
    const opt = document.createElement("option");
    opt.value = award.awardCode;
    opt.textContent = `${award.awardCode} – ${award.name || "Unnamed award"}`;
    awardSelect.appendChild(opt);
  }

  if (awardOptionsCount) {
    awardOptionsCount.textContent = `(${awards.length} options)`;
  }
  if (badgeAwardsCount) {
    badgeAwardsCount.innerHTML = `<span class="badge-dot"></span><span>${awards.length} awards loaded</span>`;
  }
}

function filterAwardOptions() {
  const query = (awardSearchInput?.value || "").toLowerCase();
  if (!awardSelect) return;
  const options = Array.from(awardSelect.options);
  options.forEach((opt, idx) => {
    if (idx === 0) {
      opt.hidden = false;
      return;
    }
    const text = opt.textContent?.toLowerCase() || "";
    opt.hidden = !text.includes(query);
  });
}

function getFilteredClassifications(awardCode, rateType) {
  const { classificationsByAward, classificationsByAwardAndRateType } =
    getDataIndexes();
  if (!awardCode) return [];

  const allForAward = classificationsByAward.get(awardCode) || [];

  if (!rateType) return allForAward;

  // Requirement: when filtering by employeeRateTypeCode, also include "AD"
  const keyExact = `${awardCode}|${rateType}`;
  const keyAdult = `${awardCode}|AD`;
  const list = [
    ...(classificationsByAwardAndRateType.get(keyExact) || []),
    ...(classificationsByAwardAndRateType.get(keyAdult) || []),
  ];

  // Deduplicate by classification + level + rate type
  const seen = new Set();
  const unique = [];
  for (const c of list) {
    const k = `${c.classification}|${c.classificationLevel}|${c.employeeRateTypeCode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(c);
  }
  return unique;
}

function populateClassifications() {
  if (!classificationSelect) return;
  const awardCode = awardSelect?.value || "";
  const rateType = rateTypeSelect?.value || "";

  classificationSelect.innerHTML = "";

  if (!awardCode || !rateType) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select award and rate type first";
    classificationSelect.appendChild(opt);
    classificationSelect.disabled = true;
    if (classificationOptionsCount) {
      classificationOptionsCount.textContent = "(0 options)";
    }
    if (badgeClassificationsCount) {
      badgeClassificationsCount.innerHTML =
        '<span class="badge-dot"></span><span>No award selected</span>';
    }
    return;
  }

  const classes = getFilteredClassifications(awardCode, rateType);
  const names = Array.from(
    new Set(classes.map((c) => c.classification || "").filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = names.length
    ? `Select classification (${names.length} options)`
    : "No classifications found for this award/rate type";
  classificationSelect.appendChild(placeholder);

  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    classificationSelect.appendChild(opt);
  }

  classificationSelect.disabled = names.length === 0;

  if (classificationOptionsCount) {
    classificationOptionsCount.textContent = `(${names.length} options)`;
  }
  if (badgeClassificationsCount) {
    badgeClassificationsCount.innerHTML = `<span class="badge-dot"></span><span>${names.length} classifications available</span>`;
  }
}

function findSelectedClassification() {
  const awardCode = awardSelect?.value || "";
  const rateType = rateTypeSelect?.value || "";
  const name = classificationSelect?.value || "";
  const { classificationsByAward } = getDataIndexes();

  if (!awardCode || !name) return null;
  const allForAward = classificationsByAward.get(awardCode) || [];

  // Match by exact classification name AND classificationLevel if present,
  // and by rate type including Adult (AD) fallback.
  let candidate = null;
  for (const c of allForAward) {
    if ((c.classification || "") !== name) continue;
    if (
      rateType &&
      ![rateType, "AD"].includes(c.employeeRateTypeCode || "")
    ) {
      continue;
    }
    candidate = c;
    break;
  }
  return candidate;
}

function onClassificationChange() {
  const awardCode = awardSelect?.value || "";
  const rateType = rateTypeSelect?.value || "";
  const classification = findSelectedClassification();

  // Populate the read-only fields
  if (classification) {
    const award = getDataIndexes().awardsByCode.get(awardCode);
    if (awardFixedIdField) {
      awardFixedIdField.value = award?.awardFixedID || "";
    }
    if (classificationFixedIdField) {
      classificationFixedIdField.value = classification.classificationFixedID || "";
    }
    if (classificationLevelField) {
      classificationLevelField.value = classification.classificationLevel || "";
    }
    if (parentClassificationNameField) {
      parentClassificationNameField.value =
        classification.parentClassificationName || "";
    }
    if (baseRateField) {
      baseRateField.value =
        classification.baseRate != null
          ? classification.baseRate.toFixed(2)
          : "";
    }
    if (calculatedRateField) {
      calculatedRateField.value =
        classification.calculatedRate != null
          ? classification.calculatedRate.toFixed(2)
          : "";
    }
    if (baseRateTypeField) {
      baseRateTypeField.value = classification.baseRateType || "";
    }
    if (calculatedRateTypeField) {
      calculatedRateTypeField.value = classification.calculatedRateType || "";
    }
  } else {
    if (classificationFixedIdField) classificationFixedIdField.value = "";
    if (classificationLevelField) classificationLevelField.value = "";
    if (parentClassificationNameField) parentClassificationNameField.value = "";
    if (baseRateField) baseRateField.value = "";
    if (calculatedRateField) calculatedRateField.value = "";
    if (baseRateTypeField) baseRateTypeField.value = "";
    if (calculatedRateTypeField) calculatedRateTypeField.value = "";
  }

  // Update visual panels
  updateBaseRateDisplay({
    awardCode,
    rateType,
    classification,
  });
  updatePenaltyDisplay({
    awardCode,
    rateType,
    classification,
  });
}

function onAwardChange() {
  const awardCode = awardSelect?.value || "";
  const { awardsByCode } = getDataIndexes();

  // Clear classification selection
  if (classificationSelect) {
    classificationSelect.selectedIndex = 0;
  }
  onClassificationChange();

  // Enable rate type once award is chosen
  if (rateTypeSelect) {
    rateTypeSelect.disabled = !awardCode;
  }

  // Update allowances for this award
  updateAllowancesDisplay(awardCode);

  // Refresh classification options
  populateClassifications();

  // Update awards badge to show selected award name
  const award = awardsByCode.get(awardCode);
  if (badgeAwardsCount) {
    if (award) {
      badgeAwardsCount.innerHTML = `<span class="badge-dot"></span><span>${award.awardCode} – ${award.name || "Selected award"}</span>`;
    } else {
      const { awardsByCode: all } = getDataIndexes();
      const total = all.size;
      badgeAwardsCount.innerHTML = `<span class="badge-dot"></span><span>${total} awards loaded</span>`;
    }
  }
}

function onRateTypeChange() {
  populateClassifications();
  onClassificationChange();
}

function onYearChange() {
  // In Phase 1, year selection is informational; indexes are built on load using operative dates.
  // In future phases we can re-filter by publishedYear/operative ranges here.
}

// Initial wiring once DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  subscribeToData((state) => {
    populateAwardsFromData();
  });

  if (awardSearchInput) {
    awardSearchInput.addEventListener("input", () => {
      // Simple debounced filter – small inputs so a light debounce is enough
      window.clearTimeout(awardSearchInput._debounceId);
      awardSearchInput._debounceId = window.setTimeout(filterAwardOptions, 120);
    });
  }

  if (awardSelect) {
    awardSelect.addEventListener("change", onAwardChange);
  }
  if (rateTypeSelect) {
    rateTypeSelect.addEventListener("change", onRateTypeChange);
  }
  if (classificationSelect) {
    classificationSelect.addEventListener("change", onClassificationChange);
  }
  if (yearSelect) {
    yearSelect.addEventListener("change", onYearChange);
  }
});

