# CLAUDE.md – Fair Work Award Calculator

## Project Overview

Client-side Fair Work Australia award interpreter and roster shift cost calculator. Loads MAP (Modern Awards Platform) CSV exports from Fair Work Australia, indexes them in memory, and calculates shift costs with penalty rates, overtime, casual loading, and allowances applied.

**Phase 1:** Entirely browser-based; no backend required.

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

## Development Rules

These rules apply to every change made in this project, regardless of layer (browser JS, backend, or Salesforce).

### 1 — Unit tests required before deployment

Whenever a new component, Apex class, or calculation module is developed:

1. Write unit tests covering all significant logic paths and edge cases.
2. Run the full test suite and confirm every test passes before deploying or committing.
3. For **Salesforce Apex**: run `sf apex run test --test-level RunLocalTests -o MyOrg` and verify 0 failures.
4. For **browser/backend JS**: run `npm test` and verify 0 failures.
5. Never deploy a component whose tests are failing or untested. If a method is added to an existing class, add a corresponding test method to the existing test class.

### 2 — Salesforce development standards

All Salesforce metadata and code must comply with [Salesforce Well-Architected](https://architect.salesforce.com/well-architected/overview) and the [Apex Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/) best practices:

- **Bulkify all Apex.** Never perform SOQL queries or DML inside loops. Collect records into lists first, then perform a single query/DML operation.
- **Governor limits.** Stay well within SOQL (100 per transaction), DML (150), and heap limits. Use `@future` or `Queueable` for operations that risk exceeding limits.
- **`with sharing` vs `without sharing`.** Default to `with sharing`. Only use `without sharing` where cross-package object access is explicitly required (e.g. `maica_cc__Resource__c` traversal) and document why in a comment.
- **No hardcoded IDs.** Never hardcode Salesforce record IDs, profile IDs, or org-specific values in code or metadata.
- **Descriptive naming.** Class, method, field, and variable names must be self-describing. Avoid abbreviations except for well-known domain terms (e.g. `FT`, `CA`).
- **LWC:** Follow the [LWC Developer Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc). Use `@api`, `@track`, and wire adapters correctly. Do not manipulate the DOM directly — use reactive properties and templates.
- **SLDS.** Use [Salesforce Lightning Design System](https://www.lightningdesignsystem.com/) utility classes and base components wherever possible before writing custom CSS.
- **Test isolation.** Apex tests must use `@testSetup` or inline data creation; never rely on existing org data (`seeAllData=false` by default).

### 3 — Administrator profile access for new objects and fields

Whenever a new custom object or custom field is created:

1. Add the object and all its fields to `force-app/main/default/profiles/Admin.profile-meta.xml` with full read/write access before deploying.
2. For **custom objects**, include:
   ```xml
   <objectPermissions>
       <object>My_Object__c</object>
       <allowCreate>true</allowCreate>
       <allowDelete>true</allowDelete>
       <allowEdit>true</allowEdit>
       <allowRead>true</allowRead>
       <modifyAllRecords>true</modifyAllRecords>
       <viewAllRecords>true</viewAllRecords>
   </objectPermissions>
   ```
3. For **custom fields**, include:
   ```xml
   <fieldPermissions>
       <field>My_Object__c.My_Field__c</field>
       <editable>true</editable>
       <readable>true</readable>
   </fieldPermissions>
   ```
4. If the project uses a Permission Set (e.g. `Award_Configuration_Admin`) instead of the Admin profile, add the same permissions there and verify the set is assigned to the relevant users before deployment.

---

## Important Conventions

- **No build tool.** ES module `import`/`export` is used directly in the browser. Avoid CommonJS (`require`).
- **No runtime npm dependencies.** PapaParse is loaded via CDN `<script>` tag in HTML.
- **Operative date filtering.** All CSV rows are filtered by `isRowOperative(from, to, today)` in `data-loader.js` before indexing.
- **"AD" rate type / classification.** A value of `"AD"` in `employeeRateTypeCode` or `classification` means "applies to all" and is treated as a wildcard in matching logic.
- **Warning system.** Calculations return a `warnings` array (strings). Render these to the user; do not silently discard them.
- **Multiplier validation.** The penalty rate map builder validates that CSV penalty rates imply a sensible multiplier vs the ordinary hourly rate. When outside expected ranges it overrides and adds a warning.

---

## Salesforce LWC UI Standards

These standards apply to all Quick Action LWC components in this project. Follow them to maintain a consistent look and feel across components.

### Layout principles

- **No scrollbars.** Quick Action modals have a fixed viewport height. Design every component to fit without scrolling. Strategies: remove help-text paragraphs, use inline button groups instead of comboboxes for small option sets, collapse verbose sections by default, place related short inputs side by side.
- **No negative margins.** Do not use `margin: 0 -Npx` tricks to make elements bleed to the modal edge — they cause unwanted horizontal scrollbars inside the modal's scroll container.
- **Context banner first.** The first element in the modal body is always an inline resource/context banner (no section header, just an icon + text line). Place any status badges (e.g. PRIMARY) flush right in this banner row.

### Section headers

Render as **rounded-corner pill badges**, not full-bleed dividers.

```css
.ca-section-header {
    background: #f3f2f2;
    border-radius: 6px;
    color: #3e3e3c;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.07rem;
    margin: 6px 0 2px;
    padding: 6px 12px;
    text-transform: uppercase;
}
```

- Section headers that toggle a collapsible region add `ca-section-header_toggle` (flexbox, `cursor: pointer`, `justify-content: space-between`) with a `utility:chevronup/chevrondown` icon on the right.
- Hover state: `background: #e0e0e0`.

### Collapsible sections

Use for any section that contains a dense detail view that is not always needed. Pattern:

1. Section header pill is the toggle trigger (`onclick={handleToggle}`).
2. `@track expanded = false` (collapsed by default).
3. Collapsed state: compact one-line summary card showing the most important values.
4. Expanded state: full detail grid rendered with `<template if:true={expanded}>`.
5. Reset `expanded` to `false` when the underlying selection changes.

### Input controls

| Scenario | Control |
|---|---|
| 3–5 mutually exclusive short options | Inline segmented button group (not `lightning-combobox`) |
| Long option lists or dynamic options | `lightning-combobox` |
| Two short inputs on the same row | `ca-field-row` / `ca-field-col` flex layout |
| Dates and small numeric inputs | `lightning-input`, placed side by side where possible |

**Segmented button group pattern** (e.g. Employment Type):

```html
<div class="ca-type-group">
  <template for:each={options} for:item="opt">
    <button key={opt.value} class={opt.buttonClass}
            data-value={opt.value} onclick={handleClick} type="button">
      {opt.label}
    </button>
  </template>
</div>
```

Active button: `background: #0070d2; color: #fff; font-weight: 600`.
Inactive button: `background: #fff; border: 1px solid #dddbda; color: #3e3e3c`.
First child: `border-radius: 4px 0 0 4px`. Last child: `border-radius: 0 4px 4px 0`.

### Floating cards / detail panels

Panels that display read-only structured data float inside their section body:

```css
.ca-panel {
    border: 1px solid #dddbda;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    margin: 0 6px 4px;   /* 6px side margin gives the floating effect */
    padding: 12px 16px 10px;
}
```

Data inside panels uses a two-row CSS grid:
- Row 1: primary fields (`grid-template-columns: 2fr 1.5fr 0.4fr 1fr 1.2fr`)
- Row 2: secondary/meta fields (`grid-template-columns: repeat(4, 1fr)`)
- Rows separated by `border-top: 1px solid #efefef`
- Column gap: `18px`; label font: `0.6875rem` uppercase muted (`#706e6b`); value font: `0.875rem` `#080707`

### Status badges

All badges share a base pattern: small rounded pill, uppercase text, coloured border + tinted background.

| Badge | Background | Border | Text |
|---|---|---|---|
| Primary | `#e8f4e8` | `#2e844a` | `#1a5c34` |
| Casual loading | `#fef3cd` | `#f0c040` | `#7a5c00` |

Full-size badge (`border-radius: 12px`, `padding: 2px 10px 2px 6px`) for banner placement.
Small badge (`border-radius: 3px`, `padding: 1px 6px`, `font-size: 0.6rem`) for inline use inside cards.

### Colour palette

| Token | Hex | Usage |
|---|---|---|
| Text primary | `#080707` | Field values, body text |
| Text secondary | `#3e3e3c` | Labels, banner text |
| Text muted | `#706e6b` | Detail labels, meta text |
| Border | `#dddbda` | Cards, inputs, dividers |
| Background subtle | `#f3f2f2` | Section header pills |
| Background card | `#f8f9fb` | Compact summary cards |
| Interactive blue | `#0070d2` | Active button, links |
| Interactive blue hover | `#005fb2` | — |
| Green (positive) | `#2e844a` | Rates, primary badge border |
| Amber (casual) | `#f0c040` | Casual badge border |
| Warning | `#dd7a01` | Warning icons |

### Apex controller conventions

- Use `without sharing` on Quick Action controllers — this ensures cross-object field traversal (e.g. `Resource__r.Name`) works regardless of the Maica package's private sharing model.
- Prefer returning meaningful values from `@AuraEnabled` DML methods (e.g. `Boolean` flags, updated records) rather than `void`, so the LWC can update state without a second round-trip.
- Auto-primary / singleton-per-resource patterns: always check sibling records before setting a "only one active" flag; use `AND Id != :thisId` in the sibling query to exclude self.

### LWC JS conventions

- Make `@api recordId` a reactive getter/setter with an `_isConnected` flag. Quick Action modals sometimes set `recordId` *after* `connectedCallback` fires; the setter triggers `loadCurrentConfig()` in that case.
- Use `@track` for all state that drives template rendering.
- Keep `isLoading = true` for the initial `connectedCallback` `Promise.all`; use a separate `loadingClassifications` flag for subordinate async loads so the whole form doesn't re-hide.
- Swallow benign "no rows" / null-config errors in `loadCurrentConfig`; only surface genuine errors via `this.errorMessage`.

---

## Future Migration Notes

The architecture is designed for eventual migration to Salesforce Lightning Web Components (LWC). The `src/lib/` modules contain pure calculation logic that can be ported to Apex with minimal changes. The existing test scenarios serve as specification for Apex unit tests. See `ARCHITECTURE.md` for the full migration plan.