/**
 * resource-cost-calculator.js
 * Calculator 3 — One resource, multiple shifts
 * Uses: POST /api/v1/calculate/bulk
 */

import { getDataIndexes, subscribeToData } from './data-loader.js';
import {
  calculateWageAllowanceCost,
  calculateExpenseAllowanceCost,
} from './lib/allowance-cost.js';

const API_BASE = 'https://award-interpreter-production.up.railway.app';
let shiftCounter = 0;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(v) {
  return `$${Number(v).toFixed(2)}`;
}

function formatShiftLabel(dateStr, startTime, paidHours) {
  const safeHours = Number(paidHours) || 0;

  // Fallback if API doesn't return a usable date/time
  if (!dateStr || !startTime) {
    return `Shift, ${startTime || '--:--'}${
      safeHours ? ` (${safeHours.toFixed(2)} hrs)` : ''
    }`;
  }

  const d = new Date(`${dateStr}T${startTime}`);
  if (Number.isNaN(d.getTime())) {
    return `Shift, ${startTime}${
      safeHours ? ` (${safeHours.toFixed(2)} hrs)` : ''
    }`;
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${startTime}${
    safeHours ? ` (${safeHours.toFixed(2)} hrs)` : ''
  }`;
}

function segmentTableHtml(segments) {
  if (!segments || segments.length === 0) return '';
  const rows = segments
    .map(
      (s) => `
    <tr>
      <td>${s.description}</td>
      <td>${Number(s.hours).toFixed(2)}</td>
      <td>${fmt(s.rate)}/hr</td>
      <td>${fmt(s.cost)}</td>
    </tr>`
    )
    .join('');
  return `
    <table class="segment-table">
      <thead>
        <tr><th>Description</th><th>Hours</th><th>Rate</th><th>Cost</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── Resource dropdowns ──────────────────────────────────────────────────────

function initResourceDropdowns() {
  const { awardsByCode } = getDataIndexes();
  const awards = Array.from(awardsByCode.values()).sort((a, b) =>
    a.awardCode.localeCompare(b.awardCode)
  );

  const awardSel = document.getElementById('rccAward');
  const awardSearch = document.getElementById('rccAwardSearch');
  const awardCount = document.getElementById('rccAwardCount');
  const rateTypeSel = document.getElementById('rccRateType');
  const classSel = document.getElementById('rccClassification');
  const classCount = document.getElementById('rccClassCount');
  const loadingGroup = document.getElementById('rccLoadingGroup');
  const allowancesGroup = document.getElementById('rccAllowancesGroup');
  const wageSel = document.getElementById('rccWageAllowances');
  const expenseSel = document.getElementById('rccExpenseAllowances');

  awardSel.innerHTML =
    `<option value="">Select award (${awards.length} total)</option>` +
    awards
      .map(
        (aw) =>
          `<option value="${aw.awardCode}">${aw.awardCode} – ${aw.name}</option>`
      )
      .join('');
  awardCount.textContent = `(${awards.length} options)`;

  let searchTimer;
  awardSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = awardSearch.value.toLowerCase();
      Array.from(awardSel.options).forEach((opt) => {
        if (!opt.value) return;
        opt.hidden = q.length > 0 && !opt.text.toLowerCase().includes(q);
      });
    }, 120);
  });

  awardSel.addEventListener('change', () => {
    const selected = awardSel.options[awardSel.selectedIndex];
    awardSearch.value = selected && selected.value ? selected.text : '';
    refreshClassifications();
    refreshAllowances();
  });

  rateTypeSel.addEventListener('change', () => {
    refreshClassifications();
    loadingGroup.hidden = rateTypeSel.value !== 'CA';
  });

  function refreshClassifications() {
    const awardCode = awardSel.value;
    const rateType = rateTypeSel.value;
    const { classificationsByAwardAndRateType } = getDataIndexes();

    if (awardCode && rateType) {
      const exactKey = `${awardCode}|${rateType}`;
      const adKey = `${awardCode}|AD`;
      const exactRows = classificationsByAwardAndRateType.get(exactKey) || [];
      const adRows = classificationsByAwardAndRateType.get(adKey) || [];

      const seen = new Set();
      const combined = [...exactRows, ...adRows].filter((row) => {
        const key = `${row.classification}||${row.classificationLevel}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      classSel.innerHTML = combined.length
        ? `<option value="">Select classification</option>` +
          combined
            .map((row) => {
              const val = JSON.stringify({
                classification: row.classification,
                classificationLevel: Number(row.classificationLevel),
              });
              return `<option value='${val}'>${row.classification} (Level ${row.classificationLevel})</option>`;
            })
            .join('')
        : `<option value="">No classifications found</option>`;

      classSel.disabled = false;
      const count = combined.length;
      classCount.textContent = `(${count} option${count !== 1 ? 's' : ''})`;
    } else {
      classSel.innerHTML =
        '<option value="">Select award and rate type first</option>';
      classSel.disabled = true;
      classCount.textContent = '(0 options)';
    }
  }

  function refreshAllowances() {
    const awardCode = awardSel.value;
    const { allowancesByAward } = getDataIndexes();
    const entry =
      (awardCode && allowancesByAward.get(awardCode)) || {
        wage: [],
        expense: [],
      };

    function fill(sel, items, emptyMsg) {
      sel.innerHTML = '';
      if (!items || items.length === 0) {
        sel.innerHTML = `<option disabled>${emptyMsg}</option>`;
        sel.disabled = true;
        return;
      }
      const seen = new Set();
      items.forEach((a, idx) => {
        const label = a.allowance || a.type || `Allowance ${idx + 1}`;
        if (seen.has(label)) return;
        seen.add(label);
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = label;
        sel.appendChild(opt);
      });
      sel.disabled = false;
    }

    fill(wageSel, entry.wage, 'No wage allowances for this award');
    fill(expenseSel, entry.expense, 'No expense allowances for this award');
    allowancesGroup.hidden = !awardCode;
  }
}

// ─── Shift rows ──────────────────────────────────────────────────────────────

function createShiftRow(shiftId) {
  const today = new Date().toISOString().split('T')[0];
  const row = document.createElement('div');
  row.className = 'rcc-shift-row';
  row.dataset.shiftId = shiftId;

  row.innerHTML = `
    <div class="rcc-shift-row-fields">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" class="form-control rcc-shift-date" value="${today}" />
      </div>
      <div class="form-group">
        <label class="form-label">Start time</label>
        <input type="time" class="form-control rcc-shift-start" value="09:00" />
      </div>
      <div class="form-group">
        <label class="form-label">Duration (hrs)</label>
        <input type="number" class="form-control rcc-shift-duration" value="8" min="0.5" step="0.5" />
      </div>
      <div class="form-group">
        <label class="form-label">Break (min)</label>
        <input type="number" class="form-control rcc-shift-break" value="30" min="0" step="5" />
      </div>
      <div class="form-group">
        <label class="form-label">Kms</label>
        <input type="number" class="form-control rcc-shift-kms" value="0" min="0" step="1" />
      </div>
      <div class="form-group form-group-checkbox">
        <label class="checkbox-label">
          <input type="checkbox" class="rcc-shift-ph" />
          Public holiday
        </label>
      </div>
      <div class="form-group form-group-action">
        <button class="btn btn-secondary rcc-remove-shift" type="button">Remove</button>
      </div>
    </div>
  `;

  row.querySelector('.rcc-remove-shift').addEventListener('click', () => {
    row.remove();
    updateShiftRemoveButtons();
  });

  return row;
}

function updateShiftRemoveButtons() {
  const rows = document.querySelectorAll('#rccShifts .rcc-shift-row');
  rows.forEach((r) => {
    const btn = r.querySelector('.rcc-remove-shift');
    if (btn) {
      btn.disabled = rows.length === 1;
    }
  });
}

function addShift() {
  shiftCounter += 1;
  const row = createShiftRow(`S${shiftCounter}`);
  const container = document.getElementById('rccShifts');
  if (container) {
    container.appendChild(row);
  }
  updateShiftRemoveButtons();
}

// ─── Collect data ────────────────────────────────────────────────────────────

function collectPayload() {
  const awardCode = document.getElementById('rccAward').value || 'MA000004';
  const employmentType = document.getElementById('rccRateType').value || 'CA';
  const classVal = document.getElementById('rccClassification').value;
  const casualLoading =
    parseFloat(document.getElementById('rccLoading').value) || 25;

  let classificationLevel = 1;
  if (classVal) {
    try {
      classificationLevel = JSON.parse(classVal).classificationLevel;
    } catch {
      // ignore parse error, keep default
    }
  }

  const shifts = [];
  document.querySelectorAll('#rccShifts .rcc-shift-row').forEach((row) => {
    shifts.push({
      shift_date: row.querySelector('.rcc-shift-date').value,
      start_time: row.querySelector('.rcc-shift-start').value,
      duration_hours:
        parseFloat(row.querySelector('.rcc-shift-duration').value) || 8,
      break_minutes:
        parseFloat(row.querySelector('.rcc-shift-break').value) || 0,
      kms: parseFloat(row.querySelector('.rcc-shift-kms').value) || 0,
      is_public_holiday: row.querySelector('.rcc-shift-ph').checked,
      allowances: [],
    });
  });

  return {
    award_code: awardCode,
    employment_type: employmentType,
    classification_level: classificationLevel,
    casual_loading_percent: employmentType === 'CA' ? casualLoading : 0,
    worker_id: 'R1',
    shifts,
  };
}

function getSelectedAllowances() {
  const awardCode = document.getElementById('rccAward').value;
  const { allowancesByAward } = getDataIndexes();
  const entry =
    (awardCode && allowancesByAward.get(awardCode)) || {
      wage: [],
      expense: [],
    };

  function collect(sel, items) {
    return Array.from(sel.selectedOptions)
      .map((opt) => items[parseInt(opt.value, 10)])
      .filter(Boolean);
  }

  return {
    wage: collect(document.getElementById('rccWageAllowances'), entry.wage),
    expense: collect(
      document.getElementById('rccExpenseAllowances'),
      entry.expense
    ),
  };
}

// ─── Render result ───────────────────────────────────────────────────────────

function renderResult(data, allowances) {
  const panel = document.getElementById('rccResult');
  panel.hidden = false;

  const workerName =
    document.getElementById('rccName').value.trim() || 'Resource';
  const empType = document.getElementById('rccRateType').value || 'CA';
  const classVal = document.getElementById('rccClassification').value;
  let level = 1;
  try {
    level = JSON.parse(classVal).classificationLevel;
  } catch {
    // ignore
  }
  const loading = document.getElementById('rccLoading').value;

  let html = `
    <div class="rcc-result-header">
      <div class="rcc-result-resource-name">
        ${workerName}
        <span class="result-resource-meta">
          ${empType} · Level ${level}${
    empType === 'CA' ? ` · ${loading}% loading` : ''
  }
        </span>
      </div>
    </div>`;

  let totalCost = 0;
  let totalHours = 0;

  const uiShiftRows = document.querySelectorAll('#rccShifts .rcc-shift-row');

  data.shifts.forEach((shift, i) => {
    const uiRow = uiShiftRows[i];
    const uiDate = uiRow
      ? uiRow.querySelector('.rcc-shift-date')?.value
      : undefined;
    const uiStart = uiRow
      ? uiRow.querySelector('.rcc-shift-start')?.value
      : undefined;

    const cost = Number(shift.gross_pay || 0);
    const hours = Number(shift.paid_hours || 0);
    const label = formatShiftLabel(
      uiDate || shift.shift_date,
      uiStart || shift.start_time,
      hours
    );
    totalCost += cost;
    totalHours += hours;

    // Resolve selected classification row for allowance calculations
    const { classificationsByAward } = getDataIndexes();
    const awardCode = document.getElementById('rccAward').value;
    const allClassRows =
      (awardCode && classificationsByAward.get(awardCode)) || [];
    let classificationRow = null;
    if (classVal && awardCode) {
      try {
        const parsed = JSON.parse(classVal);
        classificationRow =
          allClassRows.find(
            (r) =>
              r.classification === parsed.classification &&
              Number(r.classificationLevel) ===
                Number(parsed.classificationLevel)
          ) || null;
      } catch {
        classificationRow = allClassRows[0] || null;
      }
    } else {
      classificationRow = allClassRows[0] || null;
    }

    const ordinaryHourly = hours > 0 ? cost / hours : 0;

    let wageCost = 0;
    let expenseCost = 0;
    const wageItems = [];
    const expenseItems = [];

    allowances.wage.forEach((a) => {
      const amount =
        calculateWageAllowanceCost(
          a,
          classificationRow,
          hours,
          ordinaryHourly
        ) || 0;
      if (!amount) return;
      wageCost += amount;
      const label = a.allowance || a.type || 'Wage allowance';
      wageItems.push({ label, amount });
    });

    const shiftRow = document.querySelectorAll('#rccShifts .rcc-shift-row')[i];
    const kms = shiftRow
      ? parseFloat(shiftRow.querySelector('.rcc-shift-kms').value) || 0
      : 0;

    allowances.expense.forEach((a) => {
      const amount = calculateExpenseAllowanceCost(a, kms) || 0;
      if (!amount) return;
      expenseCost += amount;
      const label = a.allowance || a.type || 'Expense allowance';
      expenseItems.push({ label, amount });
    });

    const shiftTotal = cost + wageCost + expenseCost;
    totalCost += wageCost + expenseCost;

    // Build breakdown rows for this shift
    let breakdownRows = `
      <tr>
        <td>Base wages</td>
        <td class="result-breakdown-amount">${fmt(cost)}</td>
      </tr>`;
    wageItems.forEach((item) => {
      breakdownRows += `
      <tr>
        <td>${item.label}</td>
        <td class="result-breakdown-amount">${fmt(item.amount)}</td>
      </tr>`;
    });
    expenseItems.forEach((item) => {
      breakdownRows += `
      <tr>
        <td>${item.label}</td>
        <td class="result-breakdown-amount">${fmt(item.amount)}</td>
      </tr>`;
    });
    breakdownRows += `
      <tr class="result-breakdown-total-row">
        <td>Total</td>
        <td class="result-breakdown-amount">${fmt(shiftTotal)}</td>
      </tr>`;

    html += `
      <details class="result-resource-block">
        <summary class="result-resource-summary">
          <span class="result-resource-arrow">▶</span>
          <span class="result-resource-name">
            Shift ${i + 1}: ${label}
            <span class="result-resource-meta">${hours.toFixed(1)} hrs</span>
          </span>
          <span class="result-resource-cost">${fmt(shiftTotal)}</span>
        </summary>
        <div class="result-resource-detail">
          ${segmentTableHtml(shift.segments)}
          <table class="result-breakdown-table">
            <tbody>
              ${breakdownRows}
            </tbody>
          </table>
          ${(shift.warnings || [])
            .map((w) => `<p class="warning-text">⚠ ${w}</p>`)
            .join('')}
        </div>
      </details>`;
  });

  html += `
    <div class="result-shift-total">
      <span>Total cost</span>
      <span>${fmt(totalCost)}</span>
    </div>
    <div class="result-shift-hours">
      <span>Total hours</span>
      <span>${totalHours.toFixed(1)} hrs</span>
    </div>`;

  panel.innerHTML = html;
}

// ─── Calculate ───────────────────────────────────────────────────────────────

async function onCalculate() {
  const panel = document.getElementById('rccResult');
  panel.hidden = false;
  panel.innerHTML = '<p class="help-text">Calculating…</p>';

  const payload = collectPayload();
  const allowances = getSelectedAllowances();

  if (!payload.award_code) {
    panel.innerHTML = '<p class="error-text">Please select an award.</p>';
    return;
  }
  if (!payload.employment_type) {
    panel.innerHTML =
      '<p class="error-text">Please select an employment type.</p>';
    return;
  }
  if (!document.getElementById('rccClassification').value) {
    panel.innerHTML =
      '<p class="error-text">Please select a classification.</p>';
    return;
  }
  if (payload.shifts.some((s) => !s.shift_date)) {
    panel.innerHTML =
      '<p class="error-text">Please enter a date for every shift.</p>';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/calculate/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    renderResult(data, allowances);
  } catch (err) {
    panel.innerHTML = `<p class="error-text">Error: ${err.message}</p>`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  initResourceDropdowns();
  shiftCounter = 0;
  const container = document.getElementById('rccShifts');
  if (container) {
    container.innerHTML = '';
  }
  addShift();
  document.getElementById('rccAddShift').addEventListener('click', addShift);
  document
    .getElementById('rccCalculate')
    .addEventListener('click', onCalculate);
}

subscribeToData(({ loaded }) => {
  if (loaded) init();
});

