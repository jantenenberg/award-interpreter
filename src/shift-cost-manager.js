/**
 * Wires roster shift entry to calculateShiftCost and displays expanded breakdown.
 */

import { getDataIndexes } from "./data-loader.js";
import { penaltyMatchesSelection } from "./lib/penalties.js";
import { calculateRosterCost } from "./lib/shift-cost.js";
import { formatMoney } from "./lib/rates.js";
import { updateBaseRateDisplay, updatePenaltyDisplay } from "./rate-display.js";

const rosterShiftsBody = document.getElementById("rosterShiftsBody");
const addShiftBtn = document.getElementById("addShiftBtn");
const calculateBtn = document.getElementById("calculateShiftBtn");
const resultPanel = document.getElementById("shiftCostResult");
const resultTotal = document.getElementById("shiftCostTotal");
const resultSegments = document.getElementById("shiftCostSegments");
const resultError = document.getElementById("shiftCostError");

const awardSelect = document.getElementById("awardSelect");
const rateTypeSelect = document.getElementById("rateTypeSelect");
const classificationSelect = document.getElementById("classificationSelect");
const allowanceTypeSelect = document.getElementById("allowanceType");
const expenseAllowanceTypeSelect = document.getElementById("expenseAllowanceType");
const casualLoadingPercentInput = document.getElementById("casualLoadingPercent");

const CASUAL_LOADING_STORAGE_KEY = "awardInterpreterCasualLoadingPercent";

function getCasualLoadingPercent() {
  const raw = casualLoadingPercentInput?.value;
  if (raw !== "" && raw != null) {
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return n;
  }
  return 25;
}

function getCurrentSelection() {
  const awardCode = awardSelect?.value || "";
  const rateType = rateTypeSelect?.value || "";
  const name = classificationSelect?.value || "";
  const { classificationsByAward, penaltiesByAward, allowancesByAward } =
    getDataIndexes();

  if (!awardCode || !name)
    return {
      awardCode,
      rateType,
      classification: null,
      penalties: [],
      wageAllowances: [],
      expenseAllowances: [],
    };

  const allForAward = classificationsByAward.get(awardCode) || [];
  const classification = allForAward.find((c) => {
    if ((c.classification || "") !== name) return false;
    if (!rateType) return true;
    return [rateType, "AD"].includes(c.employeeRateTypeCode || "");
  }) || null;

  const allPenalties = penaltiesByAward.get(awardCode) || [];
  const selection = { awardCode, rateType, classification };
  const penalties = allPenalties.filter((p) =>
    penaltyMatchesSelection(p, selection)
  );

  const selectedWageNames = Array.from(
    allowanceTypeSelect?.selectedOptions || []
  )
    .map((opt) => opt.value)
    .filter((v) => v);
  const allowanceData = allowancesByAward.get(awardCode) || {
    wage: [],
    expense: [],
  };
  const wageAllowances = allowanceData.wage.filter((w) =>
    selectedWageNames.includes(w.allowance || "")
  );

  const selectedExpenseNames = Array.from(
    expenseAllowanceTypeSelect?.selectedOptions || []
  )
    .map((opt) => opt.value)
    .filter((v) => v);
  const expenseAllowances = allowanceData.expense.filter((e) =>
    selectedExpenseNames.includes(e.allowance || "")
  );

  return {
    awardCode,
    rateType,
    classification,
    penalties,
    wageAllowances,
    expenseAllowances,
  };
}

function updateCalculateButtonState() {
  if (!calculateBtn) return;
  const { classification } = getCurrentSelection();
  const rowCount = rosterShiftsBody?.querySelectorAll("tr").length || 0;
  calculateBtn.disabled = !classification || rowCount === 0;
}

function defaultShiftDate() {
  const today = new Date();
  return (
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0")
  );
}

function createShiftRow() {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="roster-input" type="date" data-shift-date value="${defaultShiftDate()}" /></td>
    <td><input class="roster-input" type="time" data-shift-start value="09:00" /></td>
    <td><input class="roster-input" type="number" data-shift-duration min="0.25" max="168" step="0.25" value="8" placeholder="8" /></td>
    <td><input class="roster-input" type="number" data-shift-break min="0" max="480" value="30" placeholder="0" /></td>
    <td><input class="roster-input" type="number" data-shift-kms min="0" step="0.1" value="0" placeholder="0" /></td>
    <td><button class="btn-remove" type="button" aria-label="Remove shift">Remove</button></td>
  `;
  const removeBtn = tr.querySelector(".btn-remove");
  removeBtn.addEventListener("click", () => {
    tr.remove();
    updateCalculateButtonState();
  });
  return tr;
}

function addShift() {
  if (!rosterShiftsBody) return;
  const row = createShiftRow();
  rosterShiftsBody.appendChild(row);
  updateCalculateButtonState();
}

function collectShifts() {
  if (!rosterShiftsBody) return [];
  const rows = rosterShiftsBody.querySelectorAll("tr");
  const shifts = [];
  for (const row of rows) {
    const dateInput = row.querySelector("[data-shift-date]");
    const startInput = row.querySelector("[data-shift-start]");
    const durationInput = row.querySelector("[data-shift-duration]");
    const breakInput = row.querySelector("[data-shift-break]");
    const kmsInput = row.querySelector("[data-shift-kms]");
    const dateVal = dateInput?.value || "";
    const startVal = startInput?.value || "09:00";
    const durationVal = parseFloat(durationInput?.value || "0", 10) || 0;
    const breakVal = parseInt(breakInput?.value || "0", 10) || 0;
    const kmsVal = parseFloat(kmsInput?.value || "0", 10) || 0;
    if (dateVal && durationVal > 0) {
      shifts.push({
        date: dateVal,
        startTime: startVal,
        durationHours: durationVal,
        breakMinutes: breakVal,
        shiftKms: kmsVal,
      });
    }
  }
  return shifts;
}

function renderShiftResult(shift, result, index) {
  const label = `Shift ${index + 1}: ${shift.date} ${shift.startTime} (${result.totalHours.toFixed(2)} hrs)`;
  const parts = [];

  // Display warnings if any
  if (result.warnings && result.warnings.length > 0) {
    const warningHtml = result.warnings.map(
      (w) => `<div class="status-warning" style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 10px 0; border-radius: 4px;">⚠️ ${w}</div>`
    ).join("");
    parts.push(warningHtml);
  }

  if (result.segments && result.segments.length) {
    const rows = result.segments.map(
      (s) =>
        `<tr>
          <td>${s.description}</td>
          <td>${s.hours.toFixed(2)} hrs</td>
          <td>× ${formatMoney(s.ratePerHour)}/hr</td>
          <td class="rate-value">${formatMoney(s.cost)}</td>
        </tr>`
    );
    parts.push(`
      <table class="shift-cost-table">
        <tbody>${rows.join("")}</tbody>
      </table>
    `);
  }

  if (result.wageAllowances && result.wageAllowances.length) {
    const rows = result.wageAllowances.map(
      (w) =>
        `<tr>
          <td colspan="3">${w.description}</td>
          <td class="rate-value">${formatMoney(w.cost)}</td>
        </tr>`
    );
    parts.push(`
      <table class="shift-cost-table">
        <tbody>${rows.join("")}</tbody>
      </table>
    `);
  }

  if (result.expenseAllowances && result.expenseAllowances.length) {
    const rows = result.expenseAllowances.map(
      (e) =>
        `<tr>
          <td colspan="3">${e.description}</td>
          <td class="rate-value">${formatMoney(e.cost)}</td>
        </tr>`
    );
    parts.push(`
      <table class="shift-cost-table">
        <tbody>${rows.join("")}</tbody>
      </table>
    `);
  }

  return `
    <div class="roster-shift-section">
      <div class="shift-cost-section-title">${label} — ${formatMoney(result.totalCost)}</div>
      ${parts.join("")}
    </div>
  `;
}

function onCalculate() {
  if (!resultPanel || !resultTotal || !resultSegments || !resultError) return;

  const { classification, penalties, wageAllowances, expenseAllowances } =
    getCurrentSelection();
  if (!classification) {
    resultError.hidden = false;
    resultError.textContent =
      "Please select an award, rate type, and classification first.";
    resultPanel.hidden = false;
    resultSegments.innerHTML = "";
    resultTotal.textContent = "";
    return;
  }

  const shifts = collectShifts();
  if (shifts.length === 0) {
    resultError.hidden = false;
    resultError.textContent =
      "Add at least one shift with a valid date and duration.";
    resultPanel.hidden = false;
    resultSegments.innerHTML = "";
    resultTotal.textContent = "";
    return;
  }

  const casualLoadingPercent = getCasualLoadingPercent();
  // Use the user's selected rate type (dropdown), not classification.employeeRateTypeCode: when the CSV
  // has only an "AD" (applies to all) row for a classification, we still get that row when user selects "CA".
  const selectedRateType = (rateTypeSelect?.value || "").toUpperCase();
  const isCasual = selectedRateType === "CA";
  const hasWeeklyBase = (classification?.baseRateType || "").toLowerCase() === "weekly" && classification?.baseRate != null;
  // When user selected Casual and classification has weekly base, use "Casual loading %" for calculations
  const useCasualLoadingForRate = isCasual && hasWeeklyBase;

  const roster = calculateRosterCost({
    shifts,
    classification,
    penalties,
    wageAllowances,
    expenseAllowances,
    casualLoadingPercent,
    useCasualLoadingForRate,
  });

  for (const { result } of roster.shifts) {
    if (result.error) {
      resultError.hidden = false;
      resultError.textContent = result.error;
      break;
    }
  }
  resultError.hidden = true;

  const parts = roster.shifts.map(({ shift, result }, i) =>
    renderShiftResult(shift, result, i)
  );

  // Display roster-level warnings
  let warningsHtml = "";
  if (roster.warnings && roster.warnings.length > 0) {
    warningsHtml = roster.warnings.map(
      (w) => `<div class="status-warning" style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 10px 0; border-radius: 4px;">⚠️ ${w}</div>`
    ).join("");
  }

  resultPanel.hidden = false;
  resultSegments.innerHTML = warningsHtml + parts.join("");
  resultTotal.innerHTML = `
    <div class="shift-cost-total-row">
      <span class="shift-cost-total-label">Roster total (${roster.shifts.length} shift${roster.shifts.length !== 1 ? "s" : ""}, ${roster.totalHours.toFixed(2)} hrs)</span>
      <span class="rate-value rate-highlight">${formatMoney(roster.totalCost)}</span>
    </div>`;
}

function init() {
  // Restore casual loading % from localStorage
  if (casualLoadingPercentInput && typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(CASUAL_LOADING_STORAGE_KEY);
    if (saved !== null) {
      const n = Number(saved);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
        casualLoadingPercentInput.value = String(n);
      }
    }
    casualLoadingPercentInput.addEventListener("change", () => {
      const val = getCasualLoadingPercent();
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CASUAL_LOADING_STORAGE_KEY, String(val));
      }
      const { awardCode, rateType, classification } = getCurrentSelection();
      if (classification) {
        updateBaseRateDisplay({ awardCode, rateType, classification });
        updatePenaltyDisplay({ awardCode, rateType, classification });
      }
    });
  }

  if (addShiftBtn) addShiftBtn.addEventListener("click", addShift);
  if (calculateBtn) calculateBtn.addEventListener("click", onCalculate);

  addShift();

  if (awardSelect)
    awardSelect.addEventListener("change", updateCalculateButtonState);
  if (rateTypeSelect)
    rateTypeSelect.addEventListener("change", updateCalculateButtonState);
  if (classificationSelect)
    classificationSelect.addEventListener("change", updateCalculateButtonState);

  updateCalculateButtonState();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
