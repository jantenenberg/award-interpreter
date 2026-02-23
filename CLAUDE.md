# CLAUDE.md – Fair Work Award Calculator

## Project Overview

Client-side Fair Work Australia award interpreter and roster shift cost calculator. Loads MAP (Modern Awards Platform) CSV exports from Fair Work Australia, indexes them in memory, and calculates shift costs with penalty rates, overtime, casual loading, and allowances applied.

**Phase 1:** Entirely browser-based; no backend required. The `/backend` directory is a placeholder for a future Salesforce migration.

---

## Commands

```bash
# Install dev dependencies (Vitest only)
npm install

# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Serve the app locally (requires Python)
python -m http.server 8000
# Then open http://localhost:8000/index.html
```

There is no build step. The app runs as static ES modules served by any HTTP server.

---

## Architecture

```
award-intepreter/
├── index.html              # Main calculator page
├── config.html             # Rate override & validation config page
├── documentation.html      # User-facing documentation
├── styles.css
│
├── src/
│   ├── data-loader.js      # CSV fetching, parsing, in-memory indexing, pub/sub
│   ├── dropdown-manager.js # Cascading award → rate type → classification dropdowns
│   ├── rate-display.js     # Renders base rates, penalties, allowances in the UI
│   ├── shift-cost-manager.js # Roster shift form, triggers calculation, renders results
│   ├── config-manager.js   # Config/override UI (reads/writes localStorage)
│   └── lib/                # Pure, UI-agnostic calculation logic
│       ├── shift-cost.js   # Core calculation engine (shift segmentation, overtime, penalties)
│       ├── rates.js        # Rate utilities (formatMoney, getDisplayRates, casual loading)
│       ├── penalties.js    # Penalty row matching logic
│       └── allowance-cost.js # Wage and expense allowance cost calculation
│
├── tests/                  # Vitest unit tests (~1,600 lines)
│   ├── shift-cost-bugs.test.js     # Regression tests for specific bugs
│   ├── shift-cost.test.js          # General calculation scenarios
│   ├── csv.test.js                 # CSV parsing
│   ├── rates.test.js               # Rate utility functions
│   ├── penalties.test.js           # Penalty matching
│   └── classification-index.test.js # Indexing logic
│
├── data/source/            # Place the 5 MAP CSV exports here (git-ignored)
│   ├── map-award-export-2025.csv
│   ├── map-classification-export-2025.csv
│   ├── map-penalty-export-2025.csv
│   ├── map-wage-allowance-export-2025.csv
│   └── map-expense-allowance-export-2025.csv
│
└── backend/                # Placeholder for future Salesforce/FastAPI migration (not integrated)
```

---

## Data Flow

1. **Load** – `data-loader.js` fetches and parses the 5 CSVs, filters by operative date, applies localStorage overrides, builds in-memory `DATA_STATE` indexes.
2. **Subscribe** – UI modules call `subscribeToData(callback)` and are notified when data is ready.
3. **Select** – `dropdown-manager.js` populates cascading dropdowns (award → rate type → classification).
4. **Display** – `rate-display.js` renders the base rate, penalty table, and allowance lists for the current selection.
5. **Calculate** – `shift-cost-manager.js` collects shift rows and calls `calculateRosterCost()` from `lib/shift-cost.js`.
6. **Render** – Results (segments, totals, warnings) are written back to the DOM.

---

## In-Memory State (`DATA_STATE` in `data-loader.js`)

```js
{
  loaded: boolean,
  error: string | null,
  awardsByCode: Map,                          // awardCode → award object
  classificationsByAward: Map,                // awardCode → [classifications]
  classificationsByAwardAndRateType: Map,     // "awardCode|rateType" → [classifications]
  penaltiesByAward: Map,                      // awardCode → [penalties]
  allowancesByAward: Map,                     // awardCode → { wage: [...], expense: [...] }
  subscribers: Set                            // callbacks notified on load
}
```

---

## localStorage Keys

| Key | Owner | Contents |
|-----|-------|----------|
| `awardInterpreterConfig` | `config-manager.js` / `data-loader.js` | Classification/penalty overrides, validation rules, ignored issues |
| `csvPaths` | `data-loader.js` | Custom CSV file paths |
| `awardInterpreterCasualLoadingPercent` | `shift-cost-manager.js` | Last-used casual loading % |

---

## Core Calculation (`lib/shift-cost.js`)

**`calculateShiftCost(params)`** → `{ segments, wageAllowances, expenseAllowances, totalCost, totalHours, warnings, error? }`

**`calculateRosterCost(params)`** → `{ shifts: [{shift, result}], totalCost, totalHours, warnings }`

### Key Algorithms

- **Ordinary hourly rate derivation:** Weekly base ÷ 38; casual loading applied if `useCasualLoadingForRate` is set.
- **Shift segmentation:** Iterates in 6-minute steps; each step determines day type (public holiday > Sunday > Saturday > weekday) and time-of-day bucket (before 7am / 7am–6pm / after 6pm). Contiguous same-key steps are merged into segments.
- **Overtime:** Weekday overtime triggers at standard hours (×1.5 for first 3 hours, ×2.0 after).
- **Penalty rate map building (`buildPenaltyRateMap`):** Normalises penalty descriptions to canonical keys, validates implied multipliers against expected ranges, falls back to overrides from config when CSV values are inconsistent.
- **Casual minimum engagement:** If casual and paid hours < 3, cost is padded to 3 hours.

### MA000004 (Clerks Award) Casual Level 1 Special Case

Hard-coded rules override CSV data for this classification:
- Forces flat Saturday rate (×1.25), ignoring any tiered CSV Saturday rates.
- Adjusts Sunday rate when casual loading is applied.

---

## Penalty Matching (`lib/penalties.js`)

`penaltyMatchesSelection(penalty, { awardCode, rateType, classification })` — returns `true` if award, classification name+level, and rate type all match, or if the penalty's classification/rate type is `"AD"` (applies to all).

---

## Configuration & Overrides

Users can override classification and penalty rates via `config.html`. Overrides are stored in localStorage and applied in `data-loader.js` at index time. The config page also lets users:
- Scan for data issues (missing Saturday/Sunday rates, etc.)
- Set validation tolerances and minimum engagement rules
- Export/import the full config as JSON

---

## Testing

Tests use **Vitest** in a `node` environment (no DOM). All calculation logic in `src/lib/` is pure and testable without browser APIs.

When adding new penalty or calculation behaviour, add regression tests in `tests/shift-cost-bugs.test.js` (or a new file) before changing `lib/shift-cost.js`.

---

## Important Conventions

- **No build tool.** ES module `import`/`export` is used directly in the browser. Avoid CommonJS (`require`).
- **No runtime npm dependencies.** PapaParse is loaded via CDN `<script>` tag in HTML.
- **Operative date filtering.** All CSV rows are filtered by `isRowOperative(from, to, today)` in `data-loader.js` before indexing.
- **"AD" rate type / classification.** A value of `"AD"` in `employeeRateTypeCode` or `classification` means "applies to all" and is treated as a wildcard in matching logic.
- **Warning system.** Calculations return a `warnings` array (strings). Render these to the user; do not silently discard them.
- **Multiplier validation.** The penalty rate map builder validates that CSV penalty rates imply a sensible multiplier vs the ordinary hourly rate. When outside expected ranges it overrides and adds a warning.

---

## Future Migration Notes

The architecture is designed for eventual migration to Salesforce Lightning Web Components (LWC). The `src/lib/` modules contain pure calculation logic that can be ported to Apex with minimal changes. The existing test scenarios serve as specification for Apex unit tests. See `ARCHITECTURE.md` for the full migration plan.