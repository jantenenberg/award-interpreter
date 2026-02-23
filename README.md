## Fair Work Award Calculator (Phase 1)

This is a client-side Fair Work Australia award interpretation prototype. Phase 1 focuses on:

- Loading the 5 official MAP CSV exports
- Building in-memory indexes for fast lookup
- Providing cascading dropdowns to select award → employee rate type → classification
- Displaying base and penalty rates for the selected combination

### Project Structure

```text
fairwork-calculator/
├── data/
│   ├── source/                    # Place the 5 CSV files here
│   │   ├── mapawardexport2025.csv
│   │   ├── mapclassificationexport2025.csv
│   │   ├── mappenaltyexport2025.csv
│   │   ├── mapwageallowanceexport2025.csv
│   │   └── mapexpenseallowanceexport2025.csv
│   └── processed/                 # (Optional) preprocessed JSON cache, not required for Phase 1 UI
│       ├── awards.json
│       ├── classifications.json
│       ├── penalties.json
│       └── allowances.json
├── src/
│   ├── data-loader.js            # CSV parsing and data loading
│   ├── dropdown-manager.js       # Cascading dropdown logic
│   ├── rate-display.js           # Display base and penalty rates
│   └── lib/
│       ├── rates.js              # Pure rate/display logic (formatMoney, getDisplayRates, etc.)
│       └── penalties.js          # Penalty-matching logic
├── tests/                         # Unit tests (Vitest)
├── index.html                     # Main page
├── styles.css                     # Styling
└── README.md
```

### CSV Files

Place the CSVs you received from Fair Work Australia into `data/source/`. The app expects these filenames (with hyphens):

- `map-award-export-2025.csv`
- `map-classification-export-2025.csv`
- `map-penalty-export-2025.csv`
- `map-wage-allowance-export-2025.csv`
- `map-expense-allowance-export-2025.csv`

So you must serve this folder via a static web server (for example, using the built-in Cursor dev server or `python -m http.server`).

### Running the UI

1. From the project root, start a simple static server, for example:

   ```bash
   cd /Users/jantenenberg/award-intepreter
   python -m http.server 8000
   ```

2. Open the calculator in your browser:

   - `http://localhost:8000/index.html`

3. The app will:

   - Show a loading spinner while parsing the 5 CSVs
   - Populate the award dropdown from award CSV data
   - Enable employee rate type and classification dropdowns as data becomes available
   - Display base rate and penalty rate information for the selected classification (Phase 1)

### Notes & Assumptions

- Phase 1 is entirely client-side; there is no backend API.
- CSV parsing uses PapaParse via a CDN script tag.
- The `data/processed/*.json` files are optional in Phase 1; data is cached in memory. A separate Node script can be added later to pre-generate JSON for faster load.
- Rates are **displayed only** in Phase 1 – no payment/shift calculations are performed yet.

### Unit tests

Logic and calculations are covered by unit tests. Run them with:

```bash
npm install
npm test
```

Tests cover:

- **CSV parsing** (`parseCsvText`): quoted fields, commas in quotes, headers, empty rows
- **Operative date filtering** (`isRowOperative`): from/to range vs today
- **Rates** (`src/lib/rates.js`): `formatMoney`, `calcCasualLoading`, `getDisplayRates` (including weekly→hourly derivation when calculated rate is missing)
- **Penalty matching** (`src/lib/penalties.js`): award/classification/rate type and AD wildcard
- **Classification indexing**: isHeading exclusion, award + rate type indexing

