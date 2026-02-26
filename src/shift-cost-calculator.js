/**
 * shift-cost-calculator.js
 * Calculator 2 — One shift, multiple resources
 * Uses: POST /api/v1/calculate/shift-roster
 */

import { getDataIndexes, subscribeToData } from './data-loader.js';

const API_BASE = 'https://award-interpreter-production.up.railway.app';
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
  const endMinutes = d.getHours() * 60 + d.getMinutes() + durationHours * 60;
  const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${startTime}–${endH}:${endM}`;
}

function buildAwardOptions() {
  const { awardsByCode } = getDataIndexes();
  const awards = Array.from(awardsByCode.values())
    .sort((a, b) => a.awardCode.localeCompare(b.awardCode));

  if (awards.length === 0) return '';

  return awards
    .map(aw => `<option value="${aw.awardCode}">${aw.awardCode} – ${aw.name}</option>`)
    .join('');
}

function buildClassificationOptions(awardCode, rateType) {
  const { classificationsByAwardAndRateType, classificationsByAward } = getDataIndexes();

  // Try exact rate type match first, then fall back to AD classifications
  const exactKey = `${awardCode}|${rateType}`;
  const adKey = `${awardCode}|AD`;

  const exactRows = classificationsByAwardAndRateType.get(exactKey) || [];
  const adRows = classificationsByAwardAndRateType.get(adKey) || [];

  // Combine, dedup by classification name + level
  const seen = new Set();
  const combined = [...exactRows, ...adRows].filter(row => {
    const key = `${row.classification}||${row.classificationLevel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return combined
    .map(row => {
      const val = JSON.stringify({
        classification: row.classification,
        classificationLevel: Number(row.classificationLevel),
      });
      return `<option value='${val}'>${row.classification} (Level ${row.classificationLevel})</option>`;
    })
    .join('');
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

// ─── Resource row ────────────────────────────────────────────────────────────

function createResourceRow(resourceId) {
  const row = document.createElement('div');
  row.className = 'resource-row';
  row.dataset.resourceId = resourceId;

  const awardOptions = buildAwardOptions();
  const awardsByCode = getDataIndexes().awardsByCode;
  const totalAwards = awardsByCode ? awardsByCode.size : 0;

  row.innerHTML = `
    <div class="resource-row-header">
      <span class="resource-row-number">Resource ${resourceId}</span>
      <button class="btn btn-link rc-remove" type="button">Remove</button>
    </div>

    <div class="resource-row-body">

      <div class="resource-field-group">
        <label class="field-label">
          Name
        </label>
        <input type="text" class="form-control rc-name" placeholder="Resource name" />
      </div>

      <div class="resource-field-group">
        <label class="field-label">
          Award
          <span class="options-count">(${totalAwards} options)</span>
        </label>
        <input type="text" class="form-control rc-award-search"
               placeholder="Type to search ${totalAwards}+ awards" autocomplete="off" />
        <span class="help-text">Start typing an award code or name to filter.</span>
        <select class="form-select rc-award" size="5">
          <option value="">Select award (${totalAwards} total)</option>
          ${awardOptions}
        </select>
      </div>

      <div class="resource-field-group">
        <label class="field-label">
          Employee rate type
          <span class="options-count">(4 options)</span>
        </label>
        <select class="form-select rc-rate-type">
          <option value="">Select employment type</option>
          <option value="CA">CA – Casual</option>
          <option value="FT">FT – Full-time</option>
          <option value="PT">PT – Part-time</option>
          <option value="AD">AD – Adult</option>
        </select>
        <span class="help-text">Classifications are filtered by this code; adult (AD) classifications are also included where applicable.</span>
        <div class="rc-loading-group" hidden>
          <label class="field-label">Casual loading %</label>
          <input type="number" class="form-control rc-loading"
                 value="25" min="0" max="100" step="1" />
          <span class="help-text">Applied when weekly base rate is converted to hourly for casual (CA) employees. Default 25%.</span>
        </div>
      </div>

      <div class="resource-field-group">
        <label class="field-label">
          Classification
          <span class="rc-class-count options-count">(0 options)</span>
        </label>
        <select class="form-select rc-classification" disabled>
          <option value="">Select award and rate type first</option>
        </select>
        <span class="help-text">Populated after you choose an award and employee rate type.</span>
      </div>

    </div>
  `;

  const awardSearch = row.querySelector('.rc-award-search');
  const awardSel = row.querySelector('.rc-award');
  const rateTypeSel = row.querySelector('.rc-rate-type');
  const classSel = row.querySelector('.rc-classification');
  const classCount = row.querySelector('.rc-class-count');
  const loadingGroup = row.querySelector('.rc-loading-group');
  const removeBtn = row.querySelector('.rc-remove');

  // Award search filter
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
      classSel.innerHTML =
        '<option value="">Select award and rate type first</option>';
      classSel.disabled = true;
      classCount.textContent = '(0 options)';
    }
    if (rateTypeSel.value === 'CA') {
      loadingGroup.removeAttribute('hidden');
    } else {
      loadingGroup.setAttribute('hidden', '');
    }
  }

  rateTypeSel.addEventListener('change', refreshClassifications);

  // Set initial visibility of casual loading (in case of pre-selection or default)
  refreshClassifications();

  removeBtn.addEventListener('click', () => {
    row.remove();
    updateRemoveButtons();
    updateResourceNumbers();
  });

  return row;
}

function updateResourceNumbers() {
  document.querySelectorAll('#scResources .resource-row').forEach((row, i) => {
    const label = row.querySelector('.resource-row-number');
    if (label) label.textContent = `Resource ${i + 1}`;
  });
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll('#scResources .resource-row');
  rows.forEach(r => {
    r.querySelector('.rc-remove').disabled = rows.length === 1;
  });
  updateResourceNumbers();
}

function addResource() {
  resourceCounter++;
  const row = createResourceRow(`R${resourceCounter}`);
  document.getElementById('scResources').appendChild(row);
  updateRemoveButtons();
}

// ─── Collect data ────────────────────────────────────────────────────────────

function collectPayload() {
  const shiftDate = document.getElementById('scShiftDate').value;
  const startTime = document.getElementById('scShiftStart').value;
  const durationHours = parseFloat(
    document.getElementById('scShiftDuration').value) || 0;
  const breakMinutes = parseFloat(
    document.getElementById('scShiftBreak').value) || 0;
  const isPublicHoliday = document.getElementById('scPublicHoliday').checked;

  const workers = [];
  const workerIds = [];

  document.querySelectorAll('#scResources .resource-row').forEach(row => {
    const classVal = row.querySelector('.rc-classification').value;
    if (!classVal) return;

    let classification = '';
    let classificationLevel = 1;
    try {
      const parsed = JSON.parse(classVal);
      classification = parsed.classification;
      classificationLevel = parsed.classificationLevel;
    } catch { return; }

    const wId = row.dataset.resourceId;
    workers.push({
      worker_id: wId,
      worker_name: row.querySelector('.rc-name').value.trim() || `Resource ${wId}`,
      award_code: row.querySelector('.rc-award').value || 'MA000004',
      employment_type: row.querySelector('.rc-rate-type').value || 'CA',
      classification,
      classification_level: classificationLevel,
      casual_loading_percent:
        row.querySelector('.rc-rate-type').value === 'CA'
          ? parseFloat(row.querySelector('.rc-loading').value) || 25
          : 0,
    });
    workerIds.push(wId);
  });

  return {
    roster_name: 'Shift Cost',
    workers,
    shifts: [{
      shift_date: shiftDate,
      start_time: startTime,
      duration_hours: durationHours,
      break_minutes: breakMinutes,
      is_public_holiday: isPublicHoliday,
      kms: 0,
      worker_ids: workerIds,
    }],
  };
}

// ─── Render result ───────────────────────────────────────────────────────────

function renderResult(data) {
  const panel = document.getElementById('scResult');
  panel.hidden = false;

  if (!data.shifts || data.shifts.length === 0) {
    panel.innerHTML = '<p class="help-text">No results returned.</p>';
    return;
  }

  const shift = data.shifts[0];
  const label = formatShiftLabel(
    shift.shift_date, shift.start_time, shift.duration_hours);

  let html = `
    <div class="result-shift-header">
      <strong>Shift:</strong> ${label}
    </div>`;

  shift.workers.forEach(worker => {
    html += `
      <details class="result-resource-block">
        <summary class="result-resource-summary">
          <span class="result-resource-arrow">▶</span>
          <span class="result-resource-name">
            ${worker.worker_name}
            <span class="result-resource-meta">
              ${worker.employment_type} · Level ${worker.classification_level} · ${worker.casual_loading_percent}% loading
            </span>
          </span>
          <span class="result-resource-cost">${fmt(worker.gross_pay)}</span>
        </summary>
        <div class="result-resource-detail">
          ${segmentTableHtml(worker.segments)}
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
    <div class="result-shift-hours">
      <span>Total hours</span>
      <span>${Number(shift.shift_total_hours).toFixed(1)} hrs</span>
    </div>`;

  panel.innerHTML = html;
}

// ─── Calculate ───────────────────────────────────────────────────────────────

async function onCalculate() {
  const panel = document.getElementById('scResult');
  panel.hidden = false;
  panel.innerHTML = '<p class="help-text">Calculating…</p>';

  const payload = collectPayload();

  // Validate
  if (!payload.shifts[0].shift_date) {
    panel.innerHTML = '<p class="error-text">Please enter a shift date.</p>';
    return;
  }
  if (!payload.shifts[0].start_time) {
    panel.innerHTML = '<p class="error-text">Please enter a start time.</p>';
    return;
  }
  if (payload.shifts[0].duration_hours <= 0) {
    panel.innerHTML = '<p class="error-text">Please enter a valid duration.</p>';
    return;
  }
  if (payload.workers.length === 0) {
    panel.innerHTML =
      '<p class="error-text">Please add at least one resource with a classification selected.</p>';
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
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('scShiftDate').value = today;

  // Add one default resource row now that data is loaded
  resourceCounter = 0;
  document.getElementById('scResources').innerHTML = '';
  addResource();

  // Wire buttons
  document.getElementById('scAddResource')
    .addEventListener('click', addResource);
  document.getElementById('scCalculate')
    .addEventListener('click', onCalculate);
}

// Wait for CSV data to be loaded before initialising
subscribeToData(({ loaded }) => {
  if (loaded) init();
});
