/**
 * Award loader - loads Award records from Excel file
 * Follows patterns from data-loader.js for consistency
 */

/**
 * Award object structure matching map-award-export-2025.xlsx
 * @typedef {Object} Award
 * @property {string} awardID - GUID, e.g. "d95171e3-932f-f011-8c4e-00224895df16"
 * @property {number} awardFixedID - Numeric fixed ID, e.g. 1
 * @property {string} awardCode - Award code, e.g. "MA000004" (primary lookup key)
 * @property {string} name - Full award name, e.g. "General Retail Industry Award 2020"
 * @property {number} versionNumber - Version number, e.g. 3
 * @property {Date|null} awardOperativeFrom - ISO date, may be null
 * @property {Date|null} awardOperativeTo - ISO date, frequently null (meaning currently operative)
 * @property {Date|null} lastModifiedDateTime - ISO datetime, may be null
 */

/**
 * Loads awards from Excel file and returns array of Award objects
 * @param {string} filePath - Path to map-award-export-2025.xlsx
 * @returns {Promise<Award[]>} Array of Award objects
 */
export async function loadAwards(filePath) {
  // In browser: use fetch to get file, then parse with xlsx
  // In Node: use fs.readFileSync or fs.promises.readFile
  let workbook;
  let XLSX;
  
  if (typeof window === 'undefined') {
    // Node.js environment (for tests)
    const xlsxModule = await import('xlsx');
    XLSX = xlsxModule.default || xlsxModule;
    const fs = await import('fs');
    const buffer = fs.readFileSync(filePath);
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } else {
    // Browser environment
    if (window.XLSX) {
      XLSX = window.XLSX;
    } else {
      // Try to load from CDN
      const xlsxModule = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
      XLSX = xlsxModule.default || xlsxModule;
    }
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath} (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    workbook = XLSX.read(arrayBuffer, { type: 'array' });
  }

  // Get the "Award Export 2025" sheet
  const sheetName = 'Award Export 2025';
  if (!workbook.SheetNames.includes(sheetName)) {
    throw new Error(`Sheet "${sheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(', ')}`);
  }
  
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON array (first row is headers)
  // Use raw: true to get Excel date serial numbers, then convert them
  const rows = XLSX.utils.sheet_to_json(worksheet, { 
    defval: null, // Use null for empty cells
    raw: true, // Get raw values (numbers for dates, strings for text)
  });

  const awards = [];
  
  for (const row of rows) {
    // Skip header row (if it appears in data) - but XLSX.utils.sheet_to_json should skip it
    // Map Excel column names to Award properties
    const awardID = String(row['awardID'] || '').trim();
    const awardFixedIDRaw = row['awardFixedID'];
    const awardCode = String(row['awardCode'] || '').trim();
    const name = String(row['name'] || '').trim();
    const versionNumberRaw = row['versionNumber'];
    const awardOperativeFromRaw = row['awardOperativeFrom'];
    const awardOperativeToRaw = row['awardOperativeTo'];
    const lastModifiedDateTimeRaw = row['lastModifiedDateTime'];

    // Skip rows without awardCode (required field)
    if (!awardCode) continue;

    // Parse awardFixedID (integer)
    const awardFixedID = awardFixedIDRaw != null && awardFixedIDRaw !== '' 
      ? parseInt(String(awardFixedIDRaw), 10) 
      : null;
    if (isNaN(awardFixedID)) {
      throw new Error(`Invalid awardFixedID for awardCode ${awardCode}: ${awardFixedIDRaw}`);
    }

    // Parse versionNumber (integer)
    const versionNumber = versionNumberRaw != null && versionNumberRaw !== ''
      ? parseInt(String(versionNumberRaw), 10)
      : null;
    if (versionNumber != null && isNaN(versionNumber)) {
      throw new Error(`Invalid versionNumber for awardCode ${awardCode}: ${versionNumberRaw}`);
    }

    // Parse awardOperativeFrom (Date, may be null)
    let awardOperativeFrom = null;
    if (awardOperativeFromRaw != null && awardOperativeFromRaw !== '') {
      awardOperativeFrom = parseDate(awardOperativeFromRaw);
      if (!awardOperativeFrom) {
        throw new Error(`Invalid awardOperativeFrom for awardCode ${awardCode}: ${awardOperativeFromRaw}`);
      }
    }

    // Parse awardOperativeTo (Date, may be null)
    let awardOperativeTo = null;
    if (awardOperativeToRaw != null && awardOperativeToRaw !== '') {
      awardOperativeTo = parseDate(awardOperativeToRaw);
      if (!awardOperativeTo) {
        throw new Error(`Invalid awardOperativeTo for awardCode ${awardCode}: ${awardOperativeToRaw}`);
      }
    }

    // Parse lastModifiedDateTime (Date, may be null)
    let lastModifiedDateTime = null;
    if (lastModifiedDateTimeRaw != null && lastModifiedDateTimeRaw !== '') {
      lastModifiedDateTime = parseDateTime(lastModifiedDateTimeRaw);
      // Don't throw on parse failure for lastModifiedDateTime - it's optional metadata
      if (!lastModifiedDateTime) {
        console.warn(`Could not parse lastModifiedDateTime for awardCode ${awardCode}: ${lastModifiedDateTimeRaw}`);
      }
    }

    awards.push({
      awardID,
      awardFixedID,
      awardCode,
      name,
      versionNumber,
      awardOperativeFrom,
      awardOperativeTo,
      lastModifiedDateTime,
    });
  }

  return awards;
}

/**
 * Parse date from Excel value (can be ISO string, Excel serial number, or Date object)
 * @param {string|number|Date} dateValue - Date value from Excel
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateValue) {
  if (dateValue == null) return null;
  
  // If already a Date object, return it
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  // If it's a number, treat as Excel serial number (days since 1900-01-01)
  if (typeof dateValue === 'number') {
    // Excel epoch is 1900-01-01, but Excel incorrectly treats 1900 as a leap year
    // So we use: (serial - 1) days from 1900-01-01
    const excelEpoch = new Date(1900, 0, 1);
    const days = dateValue - 1; // Excel counts from 1, not 0
    const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // If it's a string, try parsing
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (!trimmed) return null;
    
    // Try ISO date format (YYYY-MM-DD)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
      if (date.getFullYear() == year && date.getMonth() == parseInt(month, 10) - 1 && date.getDate() == parseInt(day, 10)) {
        return date;
      }
    }
    
    // Fallback to Date.parse
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
}

/**
 * Parse datetime from Excel value (can be ISO string, Excel serial number, or Date object)
 * @param {string|number|Date} dateTimeValue - DateTime value from Excel
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDateTime(dateTimeValue) {
  if (dateTimeValue == null) return null;
  
  // If already a Date object, return it
  if (dateTimeValue instanceof Date) {
    return isNaN(dateTimeValue.getTime()) ? null : dateTimeValue;
  }
  
  // If it's a number, treat as Excel serial number (days since 1900-01-01, with fractional days for time)
  if (typeof dateTimeValue === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const days = dateTimeValue - 1; // Excel counts from 1, not 0
    const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // If it's a string, try parsing
  if (typeof dateTimeValue === 'string') {
    const trimmed = dateTimeValue.trim();
    if (!trimmed) return null;
    
    // Try ISO datetime format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ss.sssZ)
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
}

/**
 * Creates an index mapping awardCode → Award for O(1) lookup
 * @param {Award[]} awards - Array of Award objects
 * @returns {Map<string, Award>} Map of awardCode → Award
 */
export function createAwardsByCodeIndex(awards) {
  const index = new Map();
  for (const award of awards) {
    if (award.awardCode) {
      if (index.has(award.awardCode)) {
        console.warn(`Duplicate awardCode found: ${award.awardCode}. Keeping first occurrence.`);
        continue;
      }
      index.set(award.awardCode, award);
    }
  }
  return index;
}

/**
 * Filters awards to those active as of a given date
 * An award is active if:
 * - awardOperativeFrom ≤ asOfDate
 * - awardOperativeTo is null OR awardOperativeTo ≥ asOfDate
 * @param {Award[]} awards - Array of Award objects
 * @param {Date} asOfDate - Date to check against (defaults to today)
 * @returns {Award[]} Filtered array of active awards
 */
export function getActiveAwards(awards, asOfDate = new Date()) {
  return awards.filter(award => {
    // Check operativeFrom: if set, must be <= asOfDate
    if (award.awardOperativeFrom != null) {
      if (award.awardOperativeFrom > asOfDate) {
        return false;
      }
    }
    
    // Check operativeTo: if set, must be >= asOfDate (null means currently operative)
    if (award.awardOperativeTo != null) {
      if (award.awardOperativeTo < asOfDate) {
        return false;
      }
    }
    
    return true;
  });
}
