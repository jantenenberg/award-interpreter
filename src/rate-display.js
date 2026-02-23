// rate-display.js
// Renders base rate information and penalty tables for the selected classification.

import { getDataIndexes } from "./data-loader.js";
import {
  formatMoney,
  calcCasualLoading,
  getDisplayRates,
  getEffectiveCasualHourly,
} from "./lib/rates.js";
import { penaltyMatchesSelection } from "./lib/penalties.js";

const baseRateBody = document.getElementById("baseRateBody");
const baseRateEmpty = document.getElementById("baseRateEmpty");
const baseRateEmploymentType = document.getElementById(
  "baseRateEmploymentType"
);

const penaltiesContainer = document.getElementById("penaltiesContainer");
const penaltiesSummary = document.getElementById("penaltiesSummary");

const allowanceTypeSelect = document.getElementById("allowanceType");
const expenseAllowanceTypeSelect = document.getElementById(
  "expenseAllowanceType"
);
const wageAllowanceCount = document.getElementById("wage-allowance-count");
const expenseAllowanceCount = document.getElementById(
  "expense-allowance-count"
);

export function updateBaseRateDisplay({ awardCode, rateType, classification }) {
  if (!baseRateBody || !baseRateEmpty) return;

  // Clear any existing content
  baseRateBody.innerHTML = "";

  if (!classification) {
    baseRateBody.appendChild(baseRateEmpty);
    baseRateEmpty.hidden = false;
    if (baseRateEmploymentType) {
      baseRateEmploymentType.hidden = true;
    }
    return;
  }

  const { awardsByCode } = getDataIndexes();
  const award = awardsByCode.get(awardCode);

  const loadingPct = calcCasualLoading(
    classification.baseRate,
    classification.calculatedRate
  );

  const isCasual = rateType === "CA";
  const hasWeeklyBase = (classification.baseRateType || "").toLowerCase() === "weekly" && classification.baseRate != null;
  const casualLoadingInput = document.getElementById("casualLoadingPercent");
  const rawLoading = casualLoadingInput?.value;
  const casualLoadingPercent = (rawLoading !== "" && rawLoading != null && !Number.isNaN(Number(rawLoading)))
    ? Number(rawLoading)
    : 25;
  const effectiveCasualHourly = isCasual && hasWeeklyBase
    ? getEffectiveCasualHourly(classification, casualLoadingPercent)
    : null;

  const fragment = document.createDocumentFragment();

  const { baseValue: baseVal, baseUnit, calculatedValue: calcVal, calculatedUnit: calcDisplayUnit } =
    getDisplayRates(classification);

  // When casual + weekly base, show the rate used in the calculator (with loading %) so panel and breakdown match
  const displayCalculatedRate = effectiveCasualHourly != null && effectiveCasualHourly > 0
    ? effectiveCasualHourly
    : calcVal;
  const displayCalculatedUnit = effectiveCasualHourly != null ? "hour" : calcDisplayUnit;

  const rows = [
    {
      label: "Award",
      value: award
        ? `${award.awardCode} – ${award.name || ""}`
        : awardCode || "—",
    },
    {
      label: "Classification",
      value: classification.classification || "—",
    },
    {
      label: "Level",
      value: classification.classificationLevel || "—",
    },
    {
      label: "Base rate",
      value:
        baseVal != null ? `${formatMoney(baseVal)}/${baseUnit}` : "—",
    },
    {
      label: "Calculated rate",
      value:
        displayCalculatedRate != null
          ? `${formatMoney(displayCalculatedRate)}/${displayCalculatedUnit}`
          : "—",
      highlight: true,
    },
    {
      label: "Employment type",
      value: rateType || "—",
    },
    {
      label: "Base rate type",
      value: classification.baseRateType || "—",
    },
    {
      label: "Calculated rate type",
      value: classification.calculatedRateType || "—",
    },
    {
      label: "Clauses",
      value: classification.clauses || "—",
    },
  ];

  for (const row of rows) {
    const wrapper = document.createElement("div");
    const labelEl = document.createElement("div");
    labelEl.className = "rate-label";
    labelEl.textContent = row.label;
    const valueEl = document.createElement("div");
    valueEl.className = "rate-value";
    if (row.highlight) {
      valueEl.classList.add("rate-highlight");
    }
    valueEl.textContent = row.value;
    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    fragment.appendChild(wrapper);
  }

  if (isCasual && loadingPct != null) {
    const wrapper = document.createElement("div");
    const labelEl = document.createElement("div");
    labelEl.className = "rate-label";
    labelEl.textContent = "Casual loading";
    const valueEl = document.createElement("div");
    valueEl.className = "rate-value rate-highlight";
    valueEl.textContent = `${loadingPct.toFixed(1)}%`;
    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    fragment.appendChild(wrapper);
  }

  baseRateBody.appendChild(fragment);

  if (baseRateEmploymentType) {
    if (rateType) {
      baseRateEmploymentType.hidden = false;
      baseRateEmploymentType.textContent =
        rateType === "CA"
          ? "Casual (includes casual loading in calculated rate)"
          : `Employment type: ${rateType}`;
    } else {
      baseRateEmploymentType.hidden = true;
    }
  }
}

export function updatePenaltyDisplay(selection) {
  if (!penaltiesContainer || !penaltiesSummary) return;

  const { awardCode, rateType, classification } = selection;
  penaltiesContainer.innerHTML = "";

  if (!awardCode || !classification) {
    penaltiesSummary.textContent = "No classification selected";
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent =
      "Choose an award, employment type, and classification to see matching penalty rates.";
    penaltiesContainer.appendChild(div);
    return;
  }

  const { penaltiesByAward } = getDataIndexes();
  const allPenalties = penaltiesByAward.get(awardCode) || [];

  const matching = allPenalties.filter((p) =>
    penaltyMatchesSelection(p, selection)
  );

  if (!matching.length) {
    penaltiesSummary.textContent = "No penalties found for this selection";
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent =
      "No penalty rows in the CSV matched this award / classification / rate type combination.";
    penaltiesContainer.appendChild(div);
    return;
  }

  penaltiesSummary.textContent = `${matching.length} penalty types found`;

  const table = document.createElement("table");
  table.className = "penalties-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Description</th>
        <th scope="col">Type</th>
        <th scope="col">Rate</th>
        <th scope="col">Calculated</th>
        <th scope="col">Unit</th>
        <th scope="col">Clauses</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");

  for (const p of matching) {
    const tr = document.createElement("tr");

    const rateText =
      p.rate != null
        ? `${p.rate} ${
            p.penaltyRateUnit === "percentage" ? "%" : "x"
          }`
        : "—";
    const calcText =
      p.penaltyCalculatedValue != null
        ? formatMoney(p.penaltyCalculatedValue) + "/hour"
        : "—";

    const clausesText = p.clauses || "—";
    const clauseCell = document.createElement("td");

    // The CSV's clauseLink field is a short code (e.g. "A.4"), not a full URL.
    // To provide something useful, build a web search URL for the award + clause.
    const searchPieces = [
      awardCode || "",
      p.clauses || "",
      p.clauseDescription || "",
    ].filter(Boolean);
    const searchQuery = encodeURIComponent(searchPieces.join(" "));
    const searchUrl = searchQuery
      ? `https://www.google.com/search?q=${searchQuery}`
      : "";

    if (searchUrl) {
      clauseCell.innerHTML = `
        <span class="tooltip" title="${clausesText}">
          ${clausesText}
        </span>
        <br />
        <a class="link" href="${searchUrl}" target="_blank" rel="noreferrer">
          View clause
        </a>
      `;
    } else {
      clauseCell.textContent = clausesText;
    }

    tr.innerHTML = `
      <td>${p.penaltyDescription || "—"}</td>
      <td>${p.type || "—"}</td>
      <td>${rateText}</td>
      <td>${calcText}</td>
      <td>${p.penaltyRateUnit || "—"}</td>
    `;
    tr.appendChild(clauseCell);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  penaltiesContainer.appendChild(table);
}

export function updateAllowancesDisplay(awardCode) {
  if (
    !allowanceTypeSelect ||
    !expenseAllowanceTypeSelect ||
    !wageAllowanceCount ||
    !expenseAllowanceCount
  ) {
    return;
  }

  const { allowancesByAward } = getDataIndexes();
  const data = allowancesByAward.get(awardCode);

  allowanceTypeSelect.innerHTML = "";
  expenseAllowanceTypeSelect.innerHTML = "";

  if (!awardCode || !data) {
    allowanceTypeSelect.disabled = true;
    expenseAllowanceTypeSelect.disabled = true;

    const placeholderWage = document.createElement("option");
    placeholderWage.value = "";
    placeholderWage.textContent = "Select award first";
    allowanceTypeSelect.appendChild(placeholderWage);

    const placeholderExpense = document.createElement("option");
    placeholderExpense.value = "";
    placeholderExpense.textContent = "Select award first";
    expenseAllowanceTypeSelect.appendChild(placeholderExpense);

    wageAllowanceCount.textContent = "(0 available)";
    expenseAllowanceCount.textContent = "(0 available)";
    return;
  }

  const wage = data.wage || [];
  const expense = data.expense || [];

  // Wage allowances: unique by allowance name + type
  const wageMap = new Map();
  for (const a of wage) {
    const key = `${a.allowance || ""}|${a.type || ""}`;
    if (!wageMap.has(key)) {
      wageMap.set(key, a);
    }
  }

  // Expense allowances: unique by allowance name + type
  const expenseMap = new Map();
  for (const a of expense) {
    const key = `${a.allowance || ""}|${a.type || ""}`;
    if (!expenseMap.has(key)) {
      expenseMap.set(key, a);
    }
  }

  const wageItems = Array.from(wageMap.values());
  const expenseItems = Array.from(expenseMap.values());

  const placeholderWage = document.createElement("option");
  placeholderWage.value = "";
  placeholderWage.textContent = wageItems.length
    ? `Select wage allowances (${wageItems.length} options)`
    : "No wage allowances found for this award";
  allowanceTypeSelect.appendChild(placeholderWage);

  wageItems.forEach((a, idx) => {
    const opt = document.createElement("option");
    opt.value = `${a.allowance || ""}`;
    const rate =
      a.rate != null
        ? `${a.rate} ${a.rateUnit || ""}`.trim()
        : "";
    opt.textContent = rate
      ? `${a.allowance || "Allowance"} – ${rate}`
      : a.allowance || "Allowance";
    allowanceTypeSelect.appendChild(opt);
  });

  const placeholderExpense = document.createElement("option");
  placeholderExpense.value = "";
  placeholderExpense.textContent = expenseItems.length
    ? `Select expense allowances (${expenseItems.length} options)`
    : "No expense allowances found for this award";
  expenseAllowanceTypeSelect.appendChild(placeholderExpense);

  expenseItems.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = `${a.allowance || ""}`;
    const amt =
      a.allowanceAmount != null ? formatMoney(a.allowanceAmount) : "";
    opt.textContent = amt
      ? `${a.allowance || "Allowance"} – ${amt}`
      : a.allowance || "Allowance";
    expenseAllowanceTypeSelect.appendChild(opt);
  });

  allowanceTypeSelect.disabled = wageItems.length === 0;
  expenseAllowanceTypeSelect.disabled = expenseItems.length === 0;

  wageAllowanceCount.textContent = `(${wageItems.length} available)`;
  expenseAllowanceCount.textContent = `(${expenseItems.length} available)`;
}

