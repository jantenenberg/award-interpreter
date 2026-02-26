/**
 * roster-cost-calculator.js
 * Calculator 4 — Multiple shifts, multiple resources per shift
 * Uses: POST /api/v1/calculate/shift-roster
 */

import { getDataIndexes, subscribeToData } from './data-loader.js';
import {
  calculateWageAllowanceCost,
  calculateExpenseAllowanceCost,
} from './lib/allowance-cost.js';

const API_BASE = 'https://award-interpreter-production.up.railway.app';
let shiftCounter = 0;
let resourceCounter = 0;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(v) {
  return `$${Number(v).toFixed(2)}`;
}

function formatShiftLabel(dateStr, startTime, durationHours) {
  const d = new Date(`${dateStr}T${startTime}`);
  const days = ['Sunday','Monday','Tuesday','Wednesday',
                'Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const endMinutes = d.getHours() * 60 + d.getMinutes() +
                     Math.round(durationHours * 60);
  const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ` +
         `${d.getFullYear()}, ${startTime}–${endH}:${endM}`;
}

function segmentTableHtml(segments) {
  if (!segments || segments.length === 0) return '';
  const rows = segments.map(s => `
    <tr>
      <td>${s.description}</td>
      <td>${Number(s.hours).toFixed(2)}</td>
      <td>${fmt(s.rate)}/hr</td>
      <td>${fmt(s.cost)}</td>
    </tr>`).join('');
  return `
    <table class="segment-table">
      <thead>
        <tr><th>Description</th><th>Hours</th><th>Rate</th><th>Cost</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildAwardOptions() {
  const { awardsByCode } = getDataIndexes();
  return [...awardsByCode.values()]
    .sort((a, b) => a.awardCode.localeCompare(b.awardCode))
    .map(aw =>
      `<option value="${aw.awardCode}">${aw.awardCode} – ${aw.name}</option>`)
    .join('');
}

function buildClassificationOptions(awardCode, rateType) {
  const { classificationsByAwardAndRateType } = getDataIndexes();
  const exactRows = classificationsByAwardAndRateType.get(`${awardCode}|${rateType}`) || [];
  const adRows = classificationsByAwardAndRateType.get(`${awardCode}|AD`) || [];
  const seen = new Set();
  return [...exactRows, ...adRows]
    .filter(row => {
      const key = `${row.classification}||${row.classificationLevel}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(row => {
      const val = JSON.stringify({
        classification: row.classification,
        classificationLevel: Number(row.classificationLevel),
      });
      return `<option value='${val}'>${row.classification} (Level ${row.classificationLevel})</option>`;
    })
    .join('');
}

// ─── Resource row (inside a shift panel) ────────────────────────────────────

function createResourceRow(resourceId) {
  const { awardsByCode } = getDataIndexes();
  const totalAwards = awardsByCode.size;
  const awardOptions = buildAwardOptions();

  const row = document.createElement('details');
  row.className = 'resource-row rc4-resource-row';
  row.dataset.resourceId = resourceId;

  row.innerHTML = `
    <summary class="resource-row-header resource-row-summary">
      <span class="resource-row-number">Resource ${String(resourceId).replace(/^R/, '')}</span>
      <button class="btn btn-secondary rc4-remove-resource" type="button">Remove</button>
    </summary>

    <div class="resource-row-body">

      <div class="resource-field-group">
        <label class="field-label">Name</label>
        <input type="text" class="form-control rc4-res-name" placeholder="Resource name" />
      </div>

      <div class="resource-field-group">
        <label class="field-label">
          Award
          <span class="options-count">(${totalAwards} options)</span>
        </label>
        <input type="text" class="form-control rc4-res-award-search"
               placeholder="Type to search ${totalAwards}+ awards" autocomplete="off" />
        <span class="help-text">Start typing an award code or name to filter.</span>
        <select class="form-select rc4-res-award" size="5">
          <option value="">Select award (${totalAwards} total)</option>
          ${awardOptions}
        </select>
      </div>

      <div class="resource-field-group">
        <label class="field-label">
          Employee rate type
          <span class="options-count">(4 options)</span>
        </label>
        <select class="form-select rc4-res-rate-type">
          <option value="">Select employment type</option>
          <option value="CA">CA – Casual</option>
          <option value="FT">FT – Full-time</option>
          <option value="PT">PT – Part-time</option>
          <option value="AD">AD – Adult</option>
        </select>
        <span class="help-text">Classifications are filtered by this code; adult (AD) classifications are also included where applicable.</span>
        <div class="rc-loading-group rc4-res-loading-group" hidden>
          <label class="field-label">Casual loading %</label>
          <input type="number" class="form-control rc4-res-loading"
                 value="25" min="0" max="100" step="1" />
          <span class="help-text">Applied when weekly base rate is converted to hourly for casual (CA) employees. Default 25%.</span>
        </div>
      </div>

      <div class="resource-field-group">
        <label class="field-label">
          Classification
          <span class="rc4-res-class-count options-count">(0 options)</span>
        </label>
        <select class="form-select rc4-res-classification" disabled>
          <option value="">Select award and rate type first</option>
        </select>
        <span class="help-text">Populated after you choose an award and employee rate type.</span>
        <label class="field-label">Wage allowances</label>
        <select class="form-select rc4-res-wage-allowances" multiple size="4" disabled>
          <option value="">Select award first</option>
        </select>
        <label class="field-label">Expense allowances</label>
        <select class="form-select rc4-res-expense-allowances" multiple size="4" disabled>
          <option value="">Select award first</option>
        </select>
        <label class="field-label">Kms</label>
        <input type="number" class="form-control rc4-res-kms" value="0" min="0" step="1" />
      </div>

    </div>
  `;

  const awardSearch = row.querySelector('.rc4-res-award-search');
  const awardSel = row.querySelector('.rc4-res-award');
  const rateTypeSel = row.querySelector('.rc4-res-rate-type');
  const classSel = row.querySelector('.rc4-res-classification');
  const classCount = row.querySelector('.rc4-res-class-count');
  const loadingGroup = row.querySelector('.rc4-res-loading-group');
  const wageSel = row.querySelector('.rc4-res-wage-allowances');
  const expenseSel = row.querySelector('.rc4-res-expense-allowances');
  const removeBtn = row.querySelector('.rc4-remove-resource');

  // Award search
  let searchTimer;
  awardSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = awardSearch.value.toLowerCase();
      Array.from(awardSel.options).forEach(opt => {
        if (!opt.value) return;
        opt.hidden = q.length > 0 && !opt.text.toLowerCase().includes(q);
      });
    }, 120);
  });

  awardSel.addEventListener('change', () => {
    const selected = awardSel.options[awardSel.selectedIndex];
    awardSearch.value = selected.value ? selected.text : '';
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
    if (awardCode && rateType) {
      const opts = buildClassificationOptions(awardCode, rateType);
      classSel.innerHTML = opts
        ? `<option value="">Select classification</option>${opts}`
        : `<option value="">No classifications found</option>`;
      classSel.disabled = false;
      const count = classSel.options.length - 1;
      classCount.textContent = `(${count} option${count !== 1 ? 's' : ''})`;
    } else {
      classSel.innerHTML = '<option value="">Select award &amp; type first</option>';
      classSel.disabled = true;
      classCount.textContent = '(0 options)';
    }
  }

  function refreshAllowances() {
    const awardCode = awardSel.value;
    const { allowancesByAward } = getDataIndexes();
    const entry = (awardCode && allowancesByAward.get(awardCode)) ||
                  { wage: [], expense: [] };

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
        opt.value = idx;
        opt.textContent = label;
        sel.appendChild(opt);
      });
      sel.disabled = false;
    }

    fill(wageSel, entry.wage, 'No wage allowances for this award');
    fill(expenseSel, entry.expense, 'No expense allowances for this award');
  }

  removeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.remove();
    updateResourceRemoveButtons(row.closest('.rc4-shift-panel'));
  });

  return row;
}

function updateResourceRemoveButtons(shiftPanel) {
  if (!shiftPanel) return;
  const rows = shiftPanel.querySelectorAll('.rc4-resource-row');
  rows.forEach(r => {
    r.querySelector('.rc4-remove-resource').disabled = rows.length === 1;
  });
}

// ─── Shift panel ─────────────────────────────────────────────────────────────

function createShiftPanel(shiftId) {
  const today = new Date().toISOString().split('T')[0];
  const panel = document.createElement('div');
  panel.className = 'rc4-shift-panel';
  panel.dataset.shiftId = shiftId;

  panel.innerHTML = `
    <details class="rc4-shift-details">
      <summary class="rc4-shift-header rc4-shift-summary">
        <span class="rc4-shift-label">Shift</span>
        <button class="btn btn-secondary rc4-remove-shift" type="button">Remove Shift</button>
      </summary>
      <div class="rc4-shift-content">
    <div class="rc4-shift-fields">
      <div class="form-group">
        <label class="field-label">Date</label>
        <input type="date" class="form-input rc4-shift-date" value="${today}" />
      </div>
      <div class="form-group">
        <label class="field-label">Start time</label>
        <input type="time" class="form-input rc4-shift-start" value="09:00" />
      </div>
      <div class="form-group">
        <label class="field-label">Duration (hrs)</label>
        <input type="number" class="form-input rc4-shift-duration"
               value="8" min="0.5" step="0.5" />
      </div>
      <div class="form-group">
        <label class="field-label">Break (min)</label>
        <input type="number" class="form-input rc4-shift-break"
               value="30" min="0" step="5" />
      </div>
      <div class="form-group form-group-checkbox">
        <label class="checkbox-label">
          <input type="checkbox" class="rc4-shift-ph" />
          Public holiday
        </label>
      </div>
    </div>
    <details class="collapsible-details subsection-collapsible rc4-shift-resources-details">
      <summary class="collapsible-summary subsection-summary">Resources on this shift</summary>
      <div class="collapsible-content">
        <div class="rc4-shift-resources-header">
          <span class="field-label">Resources on this shift</span>
          <button class="btn btn-secondary rc4-add-resource" type="button">+ Add Resource</button>
        </div>
        <div class="rc4-shift-resources"></div>
      </div>
    </details>
      </div>
    </details>
  `;

  panel.querySelector('.rc4-remove-shift').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.remove();
    updateShiftRemoveButtons();
    updateShiftNumbers();
  });

  panel.querySelector('.rc4-add-resource').addEventListener('click', () => {
    resourceCounter++;
    const row = createResourceRow(`R${resourceCounter}`);
    panel.querySelector('.rc4-shift-resources').appendChild(row);
    updateResourceRemoveButtons(panel);
  });

  // Add one default resource row
  resourceCounter++;
  const defaultResource = createResourceRow(`R${resourceCounter}`);
  panel.querySelector('.rc4-shift-resources').appendChild(defaultResource);

  return panel;
}

function updateShiftRemoveButtons() {
  const panels = document.querySelectorAll('#rc4Shifts .rc4-shift-panel');
  panels.forEach(p => {
    p.querySelector('.rc4-remove-shift').disabled = panels.length === 1;
  });
}

function updateShiftNumbers() {
  document.querySelectorAll('#rc4Shifts .rc4-shift-panel').forEach((p, i) => {
    const label = p.querySelector('.rc4-shift-label');
    if (label) label.textContent = `Shift ${i + 1}`;
  });
}

function addShift() {
  shiftCounter++;
  const panel = createShiftPanel(`SH${shiftCounter}`);
  document.getElementById('rc4Shifts').appendChild(panel);
  updateShiftRemoveButtons();
  updateShiftNumbers();
}

// ─── Collect data ────────────────────────────────────────────────────────────

function collectPayload() {
  const rosterName = document.getElementById('rc4RosterName').value ||
                     'Roster Cost';
  const workers = [];
  const shifts = [];
  const workersSeen = new Set();

  document.querySelectorAll('#rc4Shifts .rc4-shift-panel').forEach(panel => {
    const shiftDate = panel.querySelector('.rc4-shift-date').value;
    const startTime = panel.querySelector('.rc4-shift-start').value;
    const durationHours =
      parseFloat(panel.querySelector('.rc4-shift-duration').value) || 8;
    const breakMinutes =
      parseFloat(panel.querySelector('.rc4-shift-break').value) || 0;
    const isPublicHoliday = panel.querySelector('.rc4-shift-ph').checked;

    const workerIds = [];
    const wageAllowanceCostsByWorker = {};
    const expenseAllowanceCostsByWorker = {};

    panel.querySelectorAll('.rc4-resource-row').forEach(row => {
      const classVal = row.querySelector('.rc4-res-classification').value;
      if (!classVal) return;

      let classification = '';
      let classificationLevel = 1;
      try {
        const parsed = JSON.parse(classVal);
        classification = parsed.classification;
        classificationLevel = parsed.classificationLevel;
      } catch { return; }

      const wId = row.dataset.resourceId;
      const awardCode = row.querySelector('.rc4-res-award').value || 'MA000004';
      const employmentType = row.querySelector('.rc4-res-rate-type').value || 'CA';
      const casualLoading = employmentType === 'CA'
        ? parseFloat(row.querySelector('.rc4-res-loading').value) || 25
        : 0;
      const workerName =
        row.querySelector('.rc4-res-name').value.trim() || `Resource ${wId}`;

      // Add to workers list if not already added
      if (!workersSeen.has(wId)) {
        workersSeen.add(wId);
        workers.push({
          worker_id: wId,
          worker_name: workerName,
          award_code: awardCode,
          employment_type: employmentType,
          classification,
          classification_level: classificationLevel,
          casual_loading_percent: casualLoading,
        });
      }

      workerIds.push(wId);

      // Calculate allowance costs for this resource on this shift
      const { allowancesByAward, classificationsByAward } = getDataIndexes();
      const allowanceEntry =
        (awardCode && allowancesByAward.get(awardCode)) ||
        { wage: [], expense: [] };
      const classificationRows = (awardCode && classificationsByAward.get(awardCode)) || [];
      const classificationObj = classificationRows.find(
        r => r.classification === classification && Number(r.classificationLevel) === classificationLevel
      ) || classificationRows[0] || {};

      const ordinaryHourly =
        (1008.90 / 38) * (1 + casualLoading / 100);
      const paidHours = Math.max(durationHours - breakMinutes / 60, 0);

      const wageSel = row.querySelector('.rc4-res-wage-allowances');
      const expenseSel = row.querySelector('.rc4-res-expense-allowances');
      const kms = parseFloat(row.querySelector('.rc4-res-kms').value) || 0;

      let wageCost = 0;
      let expenseCost = 0;

      if (wageSel && !wageSel.disabled) {
        Array.from(wageSel.selectedOptions).forEach(opt => {
          const allowance = allowanceEntry.wage[parseInt(opt.value)];
          if (!allowance) return;
          wageCost += calculateWageAllowanceCost(
            allowance, classificationObj, paidHours, ordinaryHourly) || 0;
        });
      }

      if (expenseSel && !expenseSel.disabled) {
        Array.from(expenseSel.selectedOptions).forEach(opt => {
          const allowance = allowanceEntry.expense[parseInt(opt.value)];
          if (!allowance) return;
          expenseCost += calculateExpenseAllowanceCost(allowance, kms) || 0;
        });
      }

      if (wageCost > 0) wageAllowanceCostsByWorker[wId] = wageCost;
      if (expenseCost > 0) expenseAllowanceCostsByWorker[wId] = expenseCost;
    });

    shifts.push({
      shift_date: shiftDate,
      start_time: startTime,
      duration_hours: durationHours,
      break_minutes: breakMinutes,
      is_public_holiday: isPublicHoliday,
      kms: 0,
      worker_ids: workerIds,
      wage_allowance_costs_by_worker: wageAllowanceCostsByWorker,
      expense_allowance_costs_by_worker: expenseAllowanceCostsByWorker,
    });
  });

  return { roster_name: rosterName, workers, shifts };
}

// ─── Render result ───────────────────────────────────────────────────────────

function renderResult(data) {
  const panel = document.getElementById('rc4Result');
  panel.hidden = false;

  const rosterName = document.getElementById('rc4RosterName').value ||
                     'Roster Cost';

  let html = `
    <div class="rc4-result-header">
      <span class="rc4-result-roster-name">${rosterName}</span>
    </div>`;

  // Per-shift breakdown
  data.shifts.forEach((shift, i) => {
    const label = formatShiftLabel(
      shift.shift_date, shift.start_time, shift.duration_hours);

    html += `
      <div class="rc4-result-shift-block">
        <div class="rc4-result-shift-header">
          Shift ${i + 1}: ${label}
        </div>`;

    shift.workers.forEach(worker => {
      const totalWorkerCost = Number(worker.gross_pay || 0);
      html += `
        <details class="result-resource-block">
          <summary class="result-resource-summary">
            <span class="result-resource-arrow">▶</span>
            <span class="result-resource-name">
              ${worker.worker_name}
              <span class="result-resource-meta">
                ${worker.employment_type} · Level ${worker.classification_level}
                ${worker.casual_loading_percent > 0
                  ? ` · ${worker.casual_loading_percent}% loading`
                  : ''}
              </span>
            </span>
            <span class="result-resource-cost">${fmt(totalWorkerCost)}</span>
          </summary>
          <div class="result-resource-detail">
            ${segmentTableHtml(worker.segments)}
            ${Number(worker.wage_allowance_cost || 0) > 0
              ? `<p class="allowance-text">
                   Wage allowances: ${fmt(worker.wage_allowance_cost)}
                 </p>`
              : ''}
            ${Number(worker.expense_allowance_cost || 0) > 0
              ? `<p class="allowance-text">
                   Expense allowances: ${fmt(worker.expense_allowance_cost)}
                 </p>`
              : ''}
            ${(worker.warnings || []).map(w =>
              `<p class="warning-text">⚠ ${w}</p>`).join('')}
          </div>
        </details>`;
    });

    html += `
        <div class="result-shift-total">
          <span>Shift total</span>
          <span>${fmt(shift.shift_total_cost)}</span>
        </div>
      </div>`;
  });

  // Resource totals table
  html += `
    <div class="rc4-result-resource-totals">
      <div class="rc4-result-section-label">Resource totals</div>
      <table class="rc4-totals-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Hours</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          ${data.worker_totals.map(wt => `
            <tr>
              <td>${wt.worker_name}</td>
              <td>${Number(wt.total_hours).toFixed(1)} hrs</td>
              <td>${fmt(wt.total_cost)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Roster total
  html += `
    <div class="rc4-result-roster-total">
      <div class="rc4-roster-total-row">
        <span>Roster total</span>
        <span>${Number(data.total_hours).toFixed(1)} hrs</span>
        <span>${fmt(data.total_cost)}</span>
      </div>
    </div>`;

  panel.innerHTML = html;
}

// ─── Calculate ───────────────────────────────────────────────────────────────

async function onCalculate() {
  const panel = document.getElementById('rc4Result');
  panel.hidden = false;
  panel.innerHTML = '<p class="help-text">Calculating…</p>';

  const payload = collectPayload();

  if (payload.workers.length === 0) {
    panel.innerHTML =
      '<p class="error-text">Please add at least one resource with a classification selected on each shift.</p>';
    return;
  }

  const missingDates = payload.shifts.some(s => !s.shift_date);
  if (missingDates) {
    panel.innerHTML =
      '<p class="error-text">Please enter a date for every shift.</p>';
    return;
  }

  const emptyShifts = payload.shifts.some(s => s.worker_ids.length === 0);
  if (emptyShifts) {
    panel.innerHTML =
      '<p class="error-text">Please add at least one resource to every shift.</p>';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/calculate/shift-roster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    renderResult(data);
  } catch (err) {
    panel.innerHTML = `<p class="error-text">Error: ${err.message}</p>`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  shiftCounter = 0;
  resourceCounter = 0;
  document.getElementById('rc4Shifts').innerHTML = '';
  addShift();

  document.getElementById('rc4AddShift')
    .addEventListener('click', addShift);
  document.getElementById('rc4Calculate')
    .addEventListener('click', onCalculate);
}

subscribeToData(({ loaded }) => {
  if (loaded) init();
});
