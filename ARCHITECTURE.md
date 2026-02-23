# Award Interpreter – Architecture Document

This document describes how the Fair Work Award Calculator engine is structured and how it works, to support planning a migration to Salesforce.

---

## 1. Purpose and scope

The application is a **client-side only** Fair Work award rate explorer and roster shift cost calculator. It:

- Loads and indexes five Fair Work MAP (Modern Awards Platform) CSV exports.
- Lets users select an award, employment type, and classification, then view base/penalty rates and optional allowances.
- Calculates the cost of one or more shifts using segmented time logic (day type, time-of-day, overtime, minimum engagement) and optional allowances.

There is **no backend server**. All logic runs in the browser. Data is loaded via HTTP from static CSV files (or paths configured in the Configuration page and stored in `localStorage`).

---

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser (single-page app)                       │
├─────────────────────────────────────────────────────────────────────────┤
│  index.html / config.html                                                │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │ data-loader  │───▶│ UI layer     │───▶│ shift-cost-manager        │  │
│  │ (CSV → index)│    │ dropdown-    │    │ (collect shifts, call      │  │
│  │              │    │ manager,     │    │  calculateRosterCost,     │  │
│  │              │    │ rate-display)│    │  render breakdown)         │  │
│  └──────────────┘    └──────────────┘    └─────────────┬────────────┘  │
│         │                      │                        │               │
│         │                      ▼                        ▼               │
│         │               ┌──────────────┐    ┌──────────────────────────┐
│         │               │ rate-display │    │ lib/shift-cost.js         │  │
│         └──────────────▶│ (panel UI)   │    │ calculateShiftCost        │  │
│                         └──────────────┘    │ calculateRosterCost       │  │
│                                             │ buildPenaltyRateMap       │  │
│                                             └─────────────┬────────────┘  │
│                                                           │               │
│                         ┌─────────────────────────────────┼─────────────┐ │
│                         ▼                 ▼               ▼             │ │
│                  lib/rates.js    lib/penalties.js   lib/allowance-cost.js│ │
│                  getDisplayRates  penaltyMatches     wage/expense         │ │
│                  STANDARD_HOURS   Selection         allowance cost       │ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    Static CSV files (data/source/*.csv)
                    or configured paths (localStorage)
```

---

## 3. Entry points and module graph

| Entry | File | Role |
|-------|------|------|
| Main app | `index.html` | Loads `data-loader.js`, `dropdown-manager.js`, `rate-display.js`, `shift-cost-manager.js` as ES modules. Uses PapaParse (CDN) for CSV. |
| Config app | `config.html` | Loads `data-loader.js`, `config-manager.js`. Configuration UI and overrides. |
| Tests | `tests/*.test.js` | Vitest; import `calculateShiftCost`, `calculateRosterCost`, `getDataIndexes`, etc. No DOM. |

**Dependency direction (no cycles):**

- `data-loader.js` – no app imports (root of data).
- `lib/rates.js`, `lib/penalties.js`, `lib/allowance-cost.js` – used by `lib/shift-cost.js` and/or UI.
- `lib/shift-cost.js` – depends on rates, penalties, allowance-cost; used by shift-cost-manager and config-manager.
- `dropdown-manager.js`, `rate-display.js`, `shift-cost-manager.js` – depend on data-loader and (as needed) shift-cost, rate-display, penalties.

---

## 4. Data layer

### 4.1 Data source

- **Input:** Five CSV files (Fair Work MAP exports).
  - `map-award-export-2025.csv` – awards (code, name, etc.).
  - `map-classification-export-2025.csv` – classifications (award, rate type, classification name/level, baseRate, baseRateType, calculatedRate, calculatedRateType, operativeFrom, operativeTo).
  - `map-penalty-export-2025.csv` – penalty rows (award, classification, level, rate type, penaltyDescription, rate, penaltyRateUnit, penaltyCalculatedValue).
  - `map-wage-allowance-export-2025.csv` – wage allowances (award, allowance, paymentFrequency, rate, rateUnit, allowanceAmount).
  - `map-expense-allowance-export-2025.csv` – expense allowances (award, allowance, paymentFrequency, allowanceAmount).
- **Paths:** Defaults under `data/source/`. Overridable via Configuration page; paths stored in `localStorage` key `csvPaths`.

### 4.2 Loading and indexing (`data-loader.js`)

- Fetches each CSV (e.g. `fetch(path)`), parses with PapaParse or built-in parser.
- Filters rows by operative date (`operativeFrom` / `operativeTo`).
- Applies configuration overrides (classification rates, penalty rates) when building objects; overrides loaded from `localStorage` key `awardInterpreterConfig`.
- Fills a single in-memory **DATA_STATE** object with:
  - `awardsByCode` – Map(awardCode → award object)
  - `classificationsByAward` – Map(awardCode → array of classification objects)
  - `classificationsByAwardAndRateType` – Map("awardCode|rateType" → array)
  - `penaltiesByAward` – Map(awardCode → array of penalty rows)
  - `allowancesByAward` – Map(awardCode → { wage: [], expense: [] })
- Exposes:
  - `getDataIndexes()` – returns DATA_STATE.
  - `subscribeToData(callback)` – callback invoked when data is loaded (or on load); used by UI to refresh dropdowns and panels.
- No persistence of CSV content; state is in-memory only and lost on reload unless user re-loads from same paths.

### 4.3 Configuration overrides (`config-manager.js` and shared keys)

- **Classification rate overrides:** key `awardCode|classification|rateType` → numeric rate. Used when building classification objects in data-loader so `calculatedRate` can be overridden.
- **Penalty rate overrides:** key `awardCode|classification|penaltyDescription` → numeric rate. Read in `lib/shift-cost.js` via `loadConfigurationOverrides()` from `localStorage` and applied when building the penalty rate map.
- Config (overrides, validation rules, ignored issues) is stored in `localStorage` under `awardInterpreterConfig`. Config UI lives on `config.html`.

---

## 5. UI layer (presentation only)

- **dropdown-manager.js** – Populates and wires award, rate type, and classification dropdowns from DATA_STATE. On selection change, calls `updateBaseRateDisplay` and `updatePenaltyDisplay` (rate-display) and `updateAllowancesDisplay`. Does not perform calculations.
- **rate-display.js** – Renders the “Base and penalty rates” panel (classification details, calculated rate, casual loading note) and penalty/allowance lists. Reads “Casual loading %” from the DOM for the effective rate when Casual + weekly base.
- **shift-cost-manager.js** – Roster UI: add/remove shift rows, read date/start/duration/break/kms and “Casual loading %”, call `getCurrentSelection()` (award, rate type, classification, penalties, allowances from DATA_STATE + dropdowns), then `calculateRosterCost(...)`. Renders breakdown (segments, totals) and listens for “Casual loading %” change to refresh rate display.

Selection for calculation is derived in shift-cost-manager as:

- Award = awardSelect.value, Rate type = rateTypeSelect.value, Classification name = classificationSelect.value.
- Classification object = first match in `classificationsByAward.get(awardCode)` where `classification === name` and `employeeRateTypeCode` is rateType or `"AD"`.
- Penalties = `penaltiesByAward.get(awardCode)` filtered by `penaltyMatchesSelection(p, { awardCode, rateType, classification })` (see Section 6).

---

## 6. Calculation engine (core logic)

### 6.1 Public API

- **`calculateShiftCost({ date, startTime, durationHours, breakMinutes, classification, penalties, wageAllowances, expenseAllowances, shiftKms, publicHolidays, casualLoadingPercent, useCasualLoadingForRate })`**  
  Returns: `{ segments, wageAllowances, expenseAllowances, totalCost, totalHours, warnings, error? }`.

- **`calculateRosterCost({ shifts, classification, penalties, wageAllowances, expenseAllowances, publicHolidays, casualLoadingPercent, useCasualLoadingForRate })`**  
  Returns: `{ shifts: [{ shift, result }], totalCost, totalHours, warnings }`. Each shift is passed to `calculateShiftCost` with the same classification/penalties/allowances and casual loading flags.

No DOM or I/O inside these functions; they are pure given the inputs. All “inputs” to the engine are passed as parameters (including classification and penalties chosen by the UI from DATA_STATE).

### 6.2 Ordinary hourly rate (inside `calculateShiftCost`)

- **Inputs used:** `classification` (baseRate, baseRateType, calculatedRate, calculatedRateType), `casualLoadingPercent`, `useCasualLoadingForRate`.
- **Logic (order):**
  1. If `useCasualLoadingForRate` and classification has weekly base:  
     `ordinaryHourly = (baseRate / 38) * (1 + casualLoadingPercent/100)`.  
     (0% is valid; default 25% only when value missing/NaN.)
  2. Else if calculatedRateType is hourly and calculatedRate exists: use `calculatedRate`.
  3. Else if weekly base: for casual use (base/38)*loading, else base/38.
  4. Else use calculatedRate if present.
- **Output:** Single `ordinaryHourly` used to build the penalty map and for fallback segment rates.

### 6.3 Penalty rate map (`buildPenaltyRateMap`)

- **Inputs:** `penalties` (array of penalty rows), `ordinaryHourly`, `classification`.
- **Process:**
  - Normalise each row’s `penaltyDescription` to an internal key (e.g. `saturday_ordinary`, `sunday`, `ordinary`, `publicholiday`, `weekday_early_late`, `friday_late`).
  - For MA000004 CA Level 1: skip tiered Saturday keys (`saturday_first_X`, `saturday_after_X`); later force flat Saturday and (when applicable) Sunday from ordinary.
  - Prefer `penaltyCalculatedValue`; else derive from rate % or dollar amount.
  - **Multiplier validation (Section 4.3.1):** For known keys, compare implied multiplier to expected range; if out of range, override to `ordinaryHourly * expectedMultiplier` and attach audit warning.
  - **MA000004 CA Level 1:** Set flat Saturday rate = ordinary × 1.25; remove any tiered Saturday entries.
  - **When `useCasualLoadingForRate`:** Set Sunday = ordinary × 1.50 so CSV Sunday (often unloaded) doesn’t undercount.
- **Output:** Map(key → dollar rate per hour). Used for every segment lookup.

### 6.4 Shift segmentation (same file, after map is built)

- **Inputs:** `date`, `startTime`, `durationHours`, `breakMinutes`, penalty map, `publicHolidays` (set of YYYY-MM-DD), classification (for casual minimum engagement).
- **Process:**
  - Compute paid duration (duration − break).
  - Walk in 6-minute steps; for each moment determine day type (public holiday → Sunday → Saturday → weekday) and time-of-day (before 7am, 7am–6pm, after 6pm; Friday after 6pm = friday_late). Apply overtime rules (e.g. after 9 ordinary hours, ×1.5 then ×2.0).
  - For Saturday, use flat rate for MA000004 CA Level 1; for others, tiered logic if present in map.
  - If casual and paid hours < 3, pad to 3 hours at the shift’s day-type rate.
  - Accumulate contiguous same-key segments; each segment: hours × rate from map.
- **Output:** Array of `{ description, hours, ratePerHour, cost }` plus totalCost, totalHours, warnings.

### 6.5 Allowances

- **Wage allowances:** `calculateWageAllowanceCost(allowance, classification, paidHours, effectiveHourlyRate)`. When the engine calls it, it passes the same `ordinaryHourly` used for the shift so percentage-based allowances use the same effective rate (including casual loading when applicable).
- **Expense allowances:** `calculateExpenseAllowanceCost(allowance, shiftKms)` (per shift). No classification in call.
- Both are called from `calculateShiftCost` and their costs are added to the result.

### 6.6 Penalty matching (`lib/penalties.js`)

- **`penaltyMatchesSelection(penalty, selection)`** – `selection` = `{ awardCode, rateType, classification }`.
- Rules: same awardCode; classification and level must both match (with defined exception for AD); penalty.employeeRateTypeCode must match rateType or be `"AD"`. Used to filter which penalty rows are passed into `calculateShiftCost`.

---

## 7. Data flow (end-to-end)

1. **Page load**  
   data-loader fetches CSVs, parses, applies operative-date filter and config overrides, builds DATA_STATE, sets `loaded = true`, notifies subscribers.

2. **Dropdowns**  
   dropdown-manager (and config-manager on config page) subscribe to data; when loaded, they populate award / rate type / classification from DATA_STATE.

3. **User selects** award, rate type, classification; optionally sets “Casual loading %” and adds shifts (date, start, duration, break, kms).

4. **On “Calculate roster cost”** (shift-cost-manager):
   - Reads current selection (awardCode, rateType, classification, penalties, wage/expense allowances) from DATA_STATE + dropdowns using same matching as dropdown-manager (classification by name + rateType/AD; penalties via `penaltyMatchesSelection`).
   - Derives `useCasualLoadingForRate` = (rateType === "CA" && classification has weekly base).
   - Calls `calculateRosterCost({ shifts, classification, penalties, wageAllowances, expenseAllowances, casualLoadingPercent, useCasualLoadingForRate })`.
   - Renders each shift result (segments, allowances, total) and roster total.

5. **Config page**  
   Overrides and validation rules are read/written to `localStorage`; data-loader and shift-cost read them when building indexes and penalty map so no code path change is needed for overrides.

---

## 8. State and persistence

| What | Where | Lifetime |
|------|--------|----------|
| Award/classification/penalty/allowance data | In-memory (DATA_STATE) | Until page reload |
| CSV paths | localStorage `csvPaths` | Persistent (same origin) |
| Classification/penalty overrides, validation rules, ignored issues | localStorage `awardInterpreterConfig` | Persistent |
| Casual loading % | localStorage `awardInterpreterCasualLoadingPercent` | Persistent |
| Roster shift rows, dropdown choices | DOM only | Until navigate away or reload |

There is no user or session concept; no server-side state.

---

## 9. Deployment and runtime

- **Hosting:** Static: HTML, CSS, JS, and CSV files served from any web server or file system. No build step required for basic run (ES modules + CDN PapaParse). Tests use Vitest (Node).
- **Build:** Optional; project has `package.json` with Vitest only (no bundler in repo). If you introduce a bundler, entry would remain the same script tags/module roots.
- **Browser:** Runs in a modern browser that supports ES modules, `fetch`, and `localStorage`.

---

## 10. Migration to Salesforce – considerations

### 10.1 What to reimplement where

| Current piece | Salesforce-side suggestion |
|---------------|-----------------------------|
| **CSV load and index** | Replace with Salesforce data model: custom or standard objects for Awards, Classifications, Penalties, Wage/Expense Allowances. Use SOQL and (if needed) Apex to expose “indexes” (e.g. by award, by award+rateType). Keep operative date filtering and override behaviour (e.g. custom fields or separate override records). |
| **Configuration overrides** | Custom settings, custom metadata, or custom objects; read in Apex or LWC and feed into the same “selection + penalty map” logic. |
| **Selection (award, rate type, classification)** | Same concept: user picks award + employment type + classification; backend or LWC resolves classification record and filtered penalty/allowance list. |
| **`calculateShiftCost` / `calculateRosterCost`** | Best candidate to move to **Apex** (or serverless function) so one shared implementation serves LWC, flows, or other clients. Inputs: same structure (classification object, penalty list, shifts array, casualLoadingPercent, useCasualLoadingForRate, publicHolidays). Output: same (segments, totals, warnings). |
| **`buildPenaltyRateMap`, penalty key normalisation, multiplier validation, MA000004 Saturday/Sunday rules** | Keep inside the same Apex (or server) calculation module so all clients get identical behaviour. |
| **`lib/rates.js`** (getDisplayRates, getEffectiveCasualHourly, STANDARD_HOURS_PER_WEEK) | Reimplement in Apex (or shared server) and use from the shift-cost logic; optionally expose for UI “calculated rate” display. |
| **`lib/penalties.js`** (penaltyMatchesSelection) | Reimplement in Apex when filtering penalty rows for a given selection. |
| **`lib/allowance-cost.js`** | Reimplement in Apex; call from the same shift-cost service with the same effective hourly rate. |
| **UI (dropdowns, roster form, breakdown)** | Rebuild in **Lightning Web Components** (or similar); LWC calls Apex `calculateRosterCost` (or REST API wrapping it) with selected classification + penalties + shifts + casual loading %, and displays segments and totals. |

### 10.2 API boundary (recommended)

Define a clear **calculation API** that Salesforce (and any other client) can call:

- **Input:** Award code (or ID), rate type, classification ID or name+level, optional override map; array of shifts (date, startTime, durationHours, breakMinutes, shiftKms); optional public holidays; casual loading %; list of allowance IDs or names for wage/expense.
- **Output:** Same as current `calculateRosterCost`: per-shift segments and totals, roster totalCost/totalHours, warnings.

Then:

- **Option A:** Apex invocable method or REST service that loads “classification” and “penalties” from Salesforce data (with overrides), then runs the same algorithm as `lib/shift-cost.js` (ported to Apex).
- **Option B:** Keep a small Node (or other) service that receives the same input, loads from Salesforce via API or from replicated data, runs existing JS logic, returns same output. Use only if you prefer not to port the calculation engine to Apex yet.

### 10.3 Data model mapping (high level)

- **Awards** → Custom object or standard (e.g. “Award”) with code/name.
- **Classifications** → Custom object: Award, EmploymentType (CA/FT/PT), ClassificationName, Level, BaseRate, BaseRateType, CalculatedRate, CalculatedRateType, operative dates. Optional override field or related override record.
- **Penalties** → Custom object: Award, Classification (or name+level), RateType, PenaltyDescription, Rate, RateUnit, PenaltyCalculatedValue. Override can be same or separate object keyed by award+classification+description.
- **Wage/Expense allowances** → Custom objects with award, name, payment frequency, rate/amount, etc.
- **Public holidays** → Custom object or config (e.g. list of dates by state/territory).

Sync or ETL from MAP CSVs into these objects so “DATA_STATE” is effectively the Salesforce data plus overrides.

### 10.4 Testing

- Current Vitest tests target `calculateShiftCost` / `calculateRosterCost` with mocked classification and penalty arrays. The same cases can be replayed in Apex unit tests with equivalent test data (same numbers, same expected totals and warnings) to lock behaviour after migration.
- Reuse the scenarios in `tests/shift-cost-bugs.test.js` (weekday penalties, overtime, minimum engagement, Saturday flat rate, Sunday, public holiday, casual loading 0%/25%, roster totals) as the specification for the Apex (or server) implementation.

### 10.5 Order of work (suggested)

1. Define Salesforce data model and load/replicate MAP data (and overrides).
2. Port `lib/rates.js`, `lib/penalties.js`, `lib/allowance-cost.js`, and `lib/shift-cost.js` to Apex (or one calculation service) with the same inputs/outputs.
3. Add Apex tests mirroring the existing shift-cost-bugs tests.
4. Expose calculation as an Apex API (invocable or REST).
5. Build LWC (or other UI) that loads awards/classifications/penalties/allowances from Salesforce, collects shift rows and “Casual loading %”, calls the Apex API, and displays the same breakdown and totals.
6. Migrate configuration (overrides, validation rules) into Salesforce (custom settings/metadata/objects) and wire them into the Apex loader and penalty-map logic.

---

## 11. File reference (engine and data)

| Path | Role |
|------|------|
| `index.html` | Main app shell; loads data-loader, dropdown-manager, rate-display, shift-cost-manager. |
| `config.html` | Config app; loads data-loader, config-manager. |
| `src/data-loader.js` | CSV fetch/parse, operative filter, overrides, DATA_STATE, getDataIndexes, subscribeToData. |
| `src/dropdown-manager.js` | Award/rate type/classification dropdowns; calls rate-display on change. |
| `src/rate-display.js` | Base rate panel, penalty list, allowance list; reads Casual loading % for display. |
| `src/shift-cost-manager.js` | Roster form, getCurrentSelection, getCasualLoadingPercent, calculateRosterCost call, breakdown render. |
| `src/config-manager.js` | Config UI; overrides, validation rules; uses getDataIndexes, calculateShiftCost for validation. |
| `src/lib/shift-cost.js` | calculateShiftCost, calculateRosterCost, buildPenaltyRateMap, segmentation, validation, MA000004 rules. |
| `src/lib/rates.js` | STANDARD_HOURS_PER_WEEK, formatMoney, getDisplayRates, getEffectiveCasualHourly, calcCasualLoading. |
| `src/lib/penalties.js` | penaltyMatchesSelection. |
| `src/lib/allowance-cost.js` | calculateWageAllowanceCost, calculateExpenseAllowanceCost. |
| `data/source/*.csv` | Default MAP CSV files. |
| `documentation.html` | User-facing documentation (logic, inputs, examples). |
| `tests/shift-cost-bugs.test.js` | Main regression tests for calculation behaviour. |

This architecture keeps **calculation pure and dependency-free of the UI**, so the same engine can be reimplemented in Apex (or another service) and driven by Salesforce data and UIs without changing the documented behaviour.
