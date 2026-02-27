// data-loader.js
// Loads Fair Work MAP data from the backend API (database tables)
// and exposes indexed data + simple subscription hooks to the UI.

const DATA_STATE = {
  loaded: false,
  error: null,
  awardsByCode: new Map(),
  classificationsByAward: new Map(),
  classificationsByAwardAndRateType: new Map(),
  penaltiesByAward: new Map(),
  penaltiesByClassification: new Map(),
  allowancesByAward: new Map(), // { wage: [...], expense: [...] }
  subscribers: new Set(),
};

// Date-filter helper: keep rows whose operative range includes "today"
export function isRowOperative(operativeFrom, operativeTo, today) {
  if (!today) return true;
  const parse = (d) => (d ? new Date(d) : null);
  const from = parse(operativeFrom);
  const to = parse(operativeTo);
  if (from && today < from) return false;
  if (to && today > to) return false;
  return true;
}

function notifySubscribers() {
  for (const cb of DATA_STATE.subscribers) {
    try {
      cb(DATA_STATE);
    } catch {
      // ignore individual subscriber errors
    }
  }
}

export function subscribeToData(callback) {
  DATA_STATE.subscribers.add(callback);
  // Immediately send current state
  callback(DATA_STATE);
  return () => {
    DATA_STATE.subscribers.delete(callback);
  };
}

export function getDataIndexes() {
  return DATA_STATE;
}

async function fetchApiTable(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`API request failed: ${path} (${res.status})`);
  }
  const data = await res.json();
  return data.rows || [];
}

async function loadAllCsv() {
  const [
    awardsRows,
    classificationRows,
    penaltyRows,
    wageAllowanceRows,
    expenseAllowanceRows,
  ] = await Promise.all([
    fetchApiTable("/api/v1/reference-data/awards?limit=500"),
    fetchApiTable("/api/v1/reference-data/classifications?limit=20000"),
    fetchApiTable("/api/v1/reference-data/penalties?limit=60000"),
    fetchApiTable("/api/v1/reference-data/wage-allowances?limit=3000"),
    fetchApiTable("/api/v1/reference-data/expense-allowances?limit=2000"),
  ]);

  // Awards
  for (const row of awardsRows) {
    const { awardCode, awardID, awardFixedID, name, versionNumber, awardOperativeFrom, awardOperativeTo } = row;
    if (!awardCode) continue;
    DATA_STATE.awardsByCode.set(awardCode, {
      awardCode,
      awardID,
      awardFixedID,
      name,
      versionNumber,
      awardOperativeFrom,
      awardOperativeTo,
      raw: row,
    });
  }

  // Load configuration overrides once for all processing
  const configOverrides = loadConfigurationOverrides();

  // Classifications
  for (const row of classificationRows) {
    const {
      awardCode,
      isHeading,
      employeeRateTypeCode,
      classification,
      classificationLevel,
      classificationFixedID,
      parentClassificationName,
      baseRate,
      baseRateType,
      calculatedRate,
      calculatedRateType,
      calculatedIncludesAllPurpose,
      clauses,
      operativeFrom,
      operativeTo,
      publishedYear,
    } = row;

    if (!awardCode) continue;

    // Check for override (configOverrides loaded before loop)
    const overrideKey = `${awardCode}|${classification || ''}|${employeeRateTypeCode || ''}`;
    const overrideRate = configOverrides.classificationRates.get(overrideKey);
    
    const cBase = parseFloat(baseRate || "0") || 0;
    let cCalculated = overrideRate !== undefined 
      ? overrideRate 
      : (parseFloat(calculatedRate || "0") || cBase);

    const classificationObj = {
      awardCode,
      employeeRateTypeCode: employeeRateTypeCode || "",
      classification: classification || "",
      classificationLevel: classificationLevel || "",
      classificationFixedID,
      parentClassificationName,
      baseRate: cBase,
      baseRateType: baseRateType || "",
      calculatedRate: cCalculated,
      calculatedRateType: calculatedRateType || "",
      calculatedIncludesAllPurpose:
        String(calculatedIncludesAllPurpose || "").trim() === "1",
      clauses: clauses || "",
      publishedYear,
      operativeFrom,
      operativeTo,
      raw: row,
      isOverride: overrideRate !== undefined,
    };
    
    // Store override info if applicable
    if (overrideRate !== undefined) {
      classificationObj.originalCalculatedRate = parseFloat(calculatedRate || "0") || cBase;
    }

    // By award
    if (!DATA_STATE.classificationsByAward.has(awardCode)) {
      DATA_STATE.classificationsByAward.set(awardCode, []);
    }
    DATA_STATE.classificationsByAward.get(awardCode).push(classificationObj);

    // By award + rate type (keyed by `${awardCode}|${employeeRateTypeCode}`)
    const rt = employeeRateTypeCode || "";
    const key = `${awardCode}|${rt}`;
    if (!DATA_STATE.classificationsByAwardAndRateType.has(key)) {
      DATA_STATE.classificationsByAwardAndRateType.set(key, []);
    }
    DATA_STATE.classificationsByAwardAndRateType
      .get(key)
      .push(classificationObj);
  }

  // Penalties
  for (const row of penaltyRows) {
    const {
      awardCode,
      isHeading,
      classification,
      classificationLevel,
      penaltyDescription,
      type,
      employeeRateTypeCode,
      rate,
      penaltyRateUnit,
      penaltyCalculatedValue,
      clauses,
      clauseLink,
      operativeFrom,
      operativeTo,
    } = row;

    if (!awardCode) continue;

    const penaltyObj = {
      awardCode,
      classification: classification || "",
      classificationLevel: classificationLevel || "",
      penaltyDescription: penaltyDescription || "",
      type: type || "",
      employeeRateTypeCode: employeeRateTypeCode || "",
      rate: rate ? parseFloat(rate) : null,
      penaltyRateUnit: penaltyRateUnit || "",
      penaltyCalculatedValue: penaltyCalculatedValue
        ? parseFloat(penaltyCalculatedValue)
        : null,
      clauses: clauses || "",
      clauseLink: clauseLink || "",
      raw: row,
    };

    // By award
    if (!DATA_STATE.penaltiesByAward.has(awardCode)) {
      DATA_STATE.penaltiesByAward.set(awardCode, []);
    }
    DATA_STATE.penaltiesByAward.get(awardCode).push(penaltyObj);

    // By classification (award+classification+level)
    const clsKey = `${awardCode}|${penaltyObj.classification}|${penaltyObj.classificationLevel}`;
    if (!DATA_STATE.penaltiesByClassification.has(clsKey)) {
      DATA_STATE.penaltiesByClassification.set(clsKey, []);
    }
    DATA_STATE.penaltiesByClassification.get(clsKey).push(penaltyObj);
  }

  // Wage allowances
  for (const row of wageAllowanceRows) {
    const {
      awardCode,
      isHeading,
      allowance,
      type,
      rate,
      rateUnit,
      allowanceAmount,
      paymentFrequency,
      baseRate,
      clauses,
    } = row;
    if (!awardCode) continue;

    const allowanceObj = {
      awardCode,
      allowance: allowance || "",
      type: type || "",
      rate: rate ? parseFloat(rate) : null,
      rateUnit: rateUnit || "",
      allowanceAmount: allowanceAmount ? parseFloat(allowanceAmount) : null,
      paymentFrequency: paymentFrequency || "",
      baseRate: baseRate ? parseFloat(baseRate) : null,
      clauses: clauses || "",
      raw: row,
    };

    if (!DATA_STATE.allowancesByAward.has(awardCode)) {
      DATA_STATE.allowancesByAward.set(awardCode, { wage: [], expense: [] });
    }
    DATA_STATE.allowancesByAward.get(awardCode).wage.push(allowanceObj);
  }

  // Expense allowances
  for (const row of expenseAllowanceRows) {
    const {
      awardCode,
      isHeading,
      allowance,
      type,
      allowanceAmount,
      paymentFrequency,
      clauses,
    } = row;
    if (!awardCode) continue;

    const allowanceObj = {
      awardCode,
      allowance: allowance || "",
      type: type || "",
      allowanceAmount: allowanceAmount ? parseFloat(allowanceAmount) : null,
      paymentFrequency: paymentFrequency || "",
      clauses: clauses || "",
      raw: row,
    };

    if (!DATA_STATE.allowancesByAward.has(awardCode)) {
      DATA_STATE.allowancesByAward.set(awardCode, { wage: [], expense: [] });
    }
    DATA_STATE.allowancesByAward.get(awardCode).expense.push(allowanceObj);
  }

  DATA_STATE.loaded = true;
}

// Load configuration overrides from localStorage
function loadConfigurationOverrides() {
  const saved = localStorage.getItem('awardInterpreterConfig');
  if (saved) {
    try {
      const config = JSON.parse(saved);
      return {
        classificationRates: new Map(config.overrides?.classificationRates || []),
        penaltyRates: new Map(config.overrides?.penaltyRates || []),
      };
    } catch (e) {
      console.warn('Error loading configuration overrides:', e);
    }
  }
  return {
    classificationRates: new Map(),
    penaltyRates: new Map(),
  };
}

async function initDataLoader() {
  try {
    await loadAllCsv();
    DATA_STATE.error = null;
  } catch (err) {
    console.error("Error loading Fair Work CSV data", err);
    DATA_STATE.error = err instanceof Error ? err.message : String(err);
  } finally {
    notifySubscribers();
    const loadingText = document.getElementById("fw-loading-text");
    const loadingDetail = document.getElementById("fw-loading-detail");
    const spinner = document.querySelector(".spinner");

    if (loadingText) {
      if (DATA_STATE.error) {
        loadingText.textContent = "Failed to connect to Fair Work data tables.";
        loadingText.className = "status-error";
      } else {
        loadingText.textContent = "Connected to Fair Work data tables.";
        loadingText.className = "status-success";
      }
    }
    if (loadingDetail) {
      if (DATA_STATE.error) {
        loadingDetail.textContent =
          "Could not reach the data tables API. Check that the backend service is running.";
      } else {
        const awardsCount = DATA_STATE.awardsByCode.size;
        const classificationsCount = Array.from(
          DATA_STATE.classificationsByAward.values()
        ).reduce((sum, arr) => sum + arr.length, 0);
        const penaltiesCount = Array.from(
          DATA_STATE.penaltiesByAward.values()
        ).reduce((sum, arr) => sum + arr.length, 0);
        const wageAllowancesCount = Array.from(
          DATA_STATE.allowancesByAward.values()
        ).reduce((sum, obj) => sum + (obj.wage?.length || 0), 0);
        const expenseAllowancesCount = Array.from(
          DATA_STATE.allowancesByAward.values()
        ).reduce((sum, obj) => sum + (obj.expense?.length || 0), 0);

        loadingDetail.textContent = [
          `Awards: ${awardsCount}`,
          `Classifications: ${classificationsCount}`,
          `Penalties: ${penaltiesCount}`,
          `Wage allowances: ${wageAllowancesCount}`,
          `Expense allowances: ${expenseAllowancesCount}`,
        ].join(" • ") + " — loaded from database";
      }
    }

    if (spinner && !DATA_STATE.error) {
      spinner.classList.add("spinner-complete");
      spinner.textContent = "✓";
    }
  }
}

// Kick off loading as soon as this module is imported.
if (typeof window !== "undefined") {
  initDataLoader();
}

