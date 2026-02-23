/**
 * Configuration Manager
 * Handles file path configuration, data relationships, and data issue resolution
 */

import { getDataIndexes, subscribeToData } from "./data-loader.js";
import { calculateShiftCost } from "./lib/shift-cost.js";

class ConfigManager {
  constructor() {
    this.overrides = {
      classificationRates: new Map(), // key: "awardCode|classification|rateType" -> rate
      penaltyRates: new Map(), // key: "awardCode|classification|penaltyDescription" -> rate
      relationships: [], // array of { awardCode, classification, rateType, ... }
    };
    this.validationRules = {
      validateSundayRate: true,
      validateSaturdaySunday: true,
      rateTolerance: 0.01,
      enforceMinimumEngagement: true,
      minimumEngagementHours: 3,
    };
    this.ignoredIssues = new Set(); // Set of issue IDs to ignore
    
    this.loadConfiguration();
    this.init();
  }

  init() {
    // Populate dropdowns when data is loaded
    subscribeToData((dataState) => {
      if (dataState.loaded) {
        this.populateDropdowns();
        this.renderMappings();
        this.renderOverrides();
      }
    });

    // Load existing configuration
    this.loadConfiguration();
  }

  loadConfiguration() {
    const saved = localStorage.getItem('awardInterpreterConfig');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        if (config.overrides) {
          this.overrides.classificationRates = new Map(config.overrides.classificationRates || []);
          this.overrides.penaltyRates = new Map(config.overrides.penaltyRates || []);
          this.overrides.relationships = config.overrides.relationships || [];
        }
        if (config.validationRules) {
          this.validationRules = { ...this.validationRules, ...config.validationRules };
        }
        if (config.ignoredIssues) {
          this.ignoredIssues = new Set(config.ignoredIssues);
        }
      } catch (e) {
        console.error('Error loading configuration:', e);
      }
    }

    // Load validation rules into UI
    document.getElementById('validateSundayRate').checked = this.validationRules.validateSundayRate;
    document.getElementById('validateSaturdaySunday').checked = this.validationRules.validateSaturdaySunday;
    document.getElementById('rateTolerance').value = this.validationRules.rateTolerance;
    document.getElementById('enforceMinimumEngagement').checked = this.validationRules.enforceMinimumEngagement;
    document.getElementById('minimumEngagementHours').value = this.validationRules.minimumEngagementHours;
  }

  saveConfiguration() {
    const config = {
      overrides: {
        classificationRates: Array.from(this.overrides.classificationRates.entries()),
        penaltyRates: Array.from(this.overrides.penaltyRates.entries()),
        relationships: this.overrides.relationships,
      },
      validationRules: this.validationRules,
      ignoredIssues: Array.from(this.ignoredIssues),
    };
    localStorage.setItem('awardInterpreterConfig', JSON.stringify(config));
  }

  populateDropdowns() {
    const { awardsByCode, classificationsByAward } = getDataIndexes();
    
    // Populate award selects
    const awardSelects = [
      'awardSelectMapping',
      'penaltyAwardSelect',
      'overrideAwardSelect',
    ];
    
    awardSelects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (!select) return;
      
      // Clear existing options except first
      while (select.options.length > 1) {
        select.remove(1);
      }
      
      awardsByCode.forEach((award, code) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${code} – ${award.name || ''}`;
        select.appendChild(option);
      });
    });

    // Populate classification selects when award changes
    awardSelects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        select.addEventListener('change', () => {
          this.populateClassificationsForAward(select.value);
        });
      }
    });
  }

  populateClassificationsForAward(awardCode) {
    const { classificationsByAward } = getDataIndexes();
    const classifications = classificationsByAward.get(awardCode) || [];
    
    const classificationSelects = [
      'classificationSelectMapping',
      'penaltyClassificationSelect',
      'overrideClassificationSelect',
    ];
    
    classificationSelects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (!select) return;
      
      // Clear existing options except first
      while (select.options.length > 1) {
        select.remove(1);
      }
      
      const unique = new Set();
      classifications.forEach(cls => {
        const key = `${cls.classification}|${cls.classificationLevel}`;
        if (!unique.has(key)) {
          unique.add(key);
          const option = document.createElement('option');
          option.value = cls.classification;
          option.textContent = `${cls.classification} (Level ${cls.classificationLevel || 'N/A'})`;
          option.dataset.level = cls.classificationLevel || '';
          select.appendChild(option);
        }
      });
    });
  }

  addClassificationMapping() {
    const awardCode = document.getElementById('awardSelectMapping').value;
    const classification = document.getElementById('classificationSelectMapping').value;
    const rateType = document.getElementById('rateTypeSelectMapping').value;
    
    if (!awardCode || !classification || !rateType) {
      alert('Please select award, classification, and rate type');
      return;
    }

    const { classificationsByAward } = getDataIndexes();
    const classifications = classificationsByAward.get(awardCode) || [];
    const cls = classifications.find(c => c.classification === classification);
    
    if (cls) {
      const mapping = {
        awardCode,
        classification,
        classificationLevel: cls.classificationLevel,
        rateType,
        baseRate: cls.baseRate,
        calculatedRate: cls.calculatedRate,
      };
      
      this.overrides.relationships.push(mapping);
      this.saveConfiguration();
      this.renderMappings();
      
      // Clear inputs
      document.getElementById('awardSelectMapping').value = '';
      document.getElementById('classificationSelectMapping').value = '';
      document.getElementById('rateTypeSelectMapping').value = '';
    }
  }

  addPenaltyMapping() {
    const awardCode = document.getElementById('penaltyAwardSelect').value;
    const classification = document.getElementById('penaltyClassificationSelect').value;
    const description = document.getElementById('penaltyDescription').value.trim();
    const rate = parseFloat(document.getElementById('penaltyRate').value);
    
    if (!awardCode || !classification || !description || isNaN(rate) || rate <= 0) {
      alert('Please fill in all fields with valid values');
      return;
    }

    const key = `${awardCode}|${classification}|${description}`;
    this.overrides.penaltyRates.set(key, rate);
    this.saveConfiguration();
    this.renderMappings();
    
    // Clear inputs
    document.getElementById('penaltyAwardSelect').value = '';
    document.getElementById('penaltyClassificationSelect').value = '';
    document.getElementById('penaltyDescription').value = '';
    document.getElementById('penaltyRate').value = '';
  }

  addRateOverride() {
    const awardCode = document.getElementById('overrideAwardSelect').value;
    const classification = document.getElementById('overrideClassificationSelect').value;
    const rateType = document.getElementById('overrideRateTypeSelect').value;
    const rate = parseFloat(document.getElementById('overrideRateValue').value);
    
    if (!awardCode || !classification || !rateType || isNaN(rate) || rate <= 0) {
      alert('Please fill in all fields with valid values');
      return;
    }

    const key = `${awardCode}|${classification}|${rateType}`;
    this.overrides.classificationRates.set(key, rate);
    this.saveConfiguration();
    this.renderOverrides();
    
    // Clear inputs
    document.getElementById('overrideAwardSelect').value = '';
    document.getElementById('overrideClassificationSelect').value = '';
    document.getElementById('overrideRateTypeSelect').value = '';
    document.getElementById('overrideRateValue').value = '';
  }

  renderMappings() {
    // Render classification mappings
    const mappingsTable = document.getElementById('classificationMappingsTable');
    if (!mappingsTable) return;
    
    if (this.overrides.relationships.length === 0) {
      mappingsTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">No mappings defined. Data will use CSV relationships.</td></tr>';
      return;
    }
    
    mappingsTable.innerHTML = this.overrides.relationships.map((m, idx) => `
      <tr>
        <td>${m.awardCode}</td>
        <td>${m.classification} (Level ${m.classificationLevel || 'N/A'})</td>
        <td>${m.rateType}</td>
        <td>$${m.baseRate?.toFixed(2) || 'N/A'}</td>
        <td>$${m.calculatedRate?.toFixed(2) || 'N/A'}</td>
        <td>
          <button class="btn-small btn-ignore" onclick="window.configManager.removeMapping(${idx})">Remove</button>
        </td>
      </tr>
    `).join('');

    // Render penalty mappings
    const penaltyTable = document.getElementById('penaltyMappingsTable');
    if (!penaltyTable) return;
    
    if (this.overrides.penaltyRates.size === 0) {
      penaltyTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">No overrides defined. Using CSV data.</td></tr>';
      return;
    }
    
    penaltyTable.innerHTML = Array.from(this.overrides.penaltyRates.entries()).map(([key, rate]) => {
      const [awardCode, classification, description] = key.split('|');
      return `
        <tr>
          <td>${awardCode}</td>
          <td>${classification}</td>
          <td>${description}</td>
          <td>$${rate.toFixed(2)}</td>
          <td><span class="status-badge status-warning">Override</span></td>
          <td>
            <button class="btn-small btn-ignore" onclick="window.configManager.removePenaltyOverride('${key}')">Remove</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderOverrides() {
    const overridesTable = document.getElementById('rateOverridesTable');
    if (!overridesTable) return;
    
    if (this.overrides.classificationRates.size === 0) {
      overridesTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">No overrides defined.</td></tr>';
      return;
    }
    
    const { classificationsByAward } = getDataIndexes();
    overridesTable.innerHTML = Array.from(this.overrides.classificationRates.entries()).map(([key, overrideRate]) => {
      const [awardCode, classification, rateType] = key.split('|');
      const classifications = classificationsByAward.get(awardCode) || [];
      const cls = classifications.find(c => c.classification === classification && c.employeeRateTypeCode === rateType);
      const originalRate = cls?.calculatedRate || cls?.baseRate || 'N/A';
      
      return `
        <tr>
          <td>${awardCode}</td>
          <td>${classification}</td>
          <td>${rateType}</td>
          <td>$${typeof originalRate === 'number' ? originalRate.toFixed(2) : originalRate}</td>
          <td><strong>$${overrideRate.toFixed(2)}</strong></td>
          <td>
            <button class="btn-small btn-ignore" onclick="window.configManager.removeRateOverride('${key}')">Remove</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  removeMapping(index) {
    this.overrides.relationships.splice(index, 1);
    this.saveConfiguration();
    this.renderMappings();
  }

  removePenaltyOverride(key) {
    this.overrides.penaltyRates.delete(key);
    this.saveConfiguration();
    this.renderMappings();
  }

  removeRateOverride(key) {
    this.overrides.classificationRates.delete(key);
    this.saveConfiguration();
    this.renderOverrides();
  }

  async scanForIssues() {
    const issuesList = document.getElementById('issuesList');
    if (!issuesList) return;
    
    issuesList.innerHTML = '<li class="issue-item info"><div class="issue-header"><span class="issue-title">Scanning for issues...</span></div></li>';
    
    const issues = [];
    this.scannedIssues = new Map(); // Store issue data for fixing
    const { awardsByCode, classificationsByAward, penaltiesByAward } = getDataIndexes();
    
    // Scan each award/classification combination
    for (const [awardCode, award] of awardsByCode) {
      const classifications = classificationsByAward.get(awardCode) || [];
      const penalties = penaltiesByAward.get(awardCode) || [];
      
      for (const cls of classifications) {
        if (!cls.employeeRateTypeCode) continue;
        
        const matchingPenalties = penalties.filter(p => 
          (p.classification === cls.classification || p.classificationLevel === cls.classificationLevel) &&
          (p.employeeRateTypeCode === cls.employeeRateTypeCode || p.employeeRateTypeCode === 'AD')
        );
        
        // Check Sunday rate
        if (this.validationRules.validateSundayRate) {
          const sundayPenalty = matchingPenalties.find(p => 
            p.penaltyDescription?.toLowerCase().includes('sunday')
          );
          
          if (sundayPenalty && sundayPenalty.penaltyCalculatedValue) {
            const ordinaryRate = cls.calculatedRate || (cls.baseRate / 38 * (cls.employeeRateTypeCode === 'CA' ? 1.25 : 1));
            const expectedSundayRate = ordinaryRate * 1.50;
            const actualRate = sundayPenalty.penaltyCalculatedValue;
            const diff = Math.abs(actualRate - expectedSundayRate);
            
            if (diff > this.validationRules.rateTolerance) {
              const issueId = `sunday-rate-${awardCode}-${cls.classification}-${cls.employeeRateTypeCode}`;
              if (!this.ignoredIssues.has(issueId)) {
                const issueData = {
                  id: issueId,
                  type: 'warning',
                  title: 'Sunday rate validation',
                  message: `${awardCode} ${cls.classification} (${cls.employeeRateTypeCode}): Expected Sunday rate $${expectedSundayRate.toFixed(2)}/hr (×1.50) but found $${actualRate.toFixed(2)}/hr`,
                  awardCode,
                  classification: cls.classification,
                  rateType: cls.employeeRateTypeCode,
                  expectedRate: expectedSundayRate,
                  actualRate: actualRate,
                  penaltyDescription: sundayPenalty.penaltyDescription,
                };
                issues.push(issueData);
                this.scannedIssues.set(issueId, issueData);
              }
            }
          }
        }
        
        // Check Saturday vs Sunday consistency
        if (this.validationRules.validateSaturdaySunday) {
          const satPenalty = matchingPenalties.find(p => 
            p.penaltyDescription?.toLowerCase().includes('saturday') && 
            p.penaltyDescription?.toLowerCase().includes('ordinary')
          );
          const sunPenalty = matchingPenalties.find(p => 
            p.penaltyDescription?.toLowerCase().includes('sunday')
          );
          
          if (satPenalty && sunPenalty && satPenalty.penaltyCalculatedValue > sunPenalty.penaltyCalculatedValue) {
            const issueId = `saturday-sunday-${awardCode}-${cls.classification}-${cls.employeeRateTypeCode}`;
            if (!this.ignoredIssues.has(issueId)) {
              // Calculate expected Saturday rate (×1.25 for casual)
              const ordinaryRate = cls.calculatedRate || (cls.baseRate / 38 * (cls.employeeRateTypeCode === 'CA' ? 1.25 : 1));
              const expectedSaturdayRate = ordinaryRate * 1.25;
              const issueData = {
                id: issueId,
                type: 'warning',
                title: 'Saturday rate exceeds Sunday rate',
                message: `${awardCode} ${cls.classification} (${cls.employeeRateTypeCode}): Saturday ordinary rate ($${satPenalty.penaltyCalculatedValue.toFixed(2)}/hr) exceeds Sunday rate ($${sunPenalty.penaltyCalculatedValue.toFixed(2)}/hr). Expected Saturday rate: $${expectedSaturdayRate.toFixed(2)}/hr (×1.25)`,
                awardCode,
                classification: cls.classification,
                rateType: cls.employeeRateTypeCode,
                expectedSaturdayRate: expectedSaturdayRate,
                actualSaturdayRate: satPenalty.penaltyCalculatedValue,
                penaltyDescription: satPenalty.penaltyDescription,
              };
              issues.push(issueData);
              this.scannedIssues.set(issueId, issueData);
            }
          }
        }
      }
    }
    
    // Render issues
    if (issues.length === 0) {
      issuesList.innerHTML = '<li class="issue-item info"><div class="issue-header"><span class="issue-title">✓ No issues found</span></div></li>';
    } else {
      issuesList.innerHTML = issues.map(issue => `
        <li class="issue-item ${issue.type}" id="issue-${issue.id}">
          <div class="issue-header">
            <div>
              <span class="issue-title">${issue.title}</span>
              <p style="margin: 8px 0 0 0; color: #666;">${issue.message}</p>
            </div>
            <div class="issue-actions">
              ${(issue.expectedRate || issue.expectedSaturdayRate) ? `
                <button class="btn-small btn-fix" onclick="window.configManager.fixIssue('${issue.id}')">Fix</button>
              ` : ''}
              <button class="btn-small btn-ignore" onclick="window.configManager.ignoreIssue('${issue.id}')">Ignore</button>
            </div>
          </div>
        </li>
      `).join('');
    }
  }

  fixIssue(issueId) {
    const issueData = this.scannedIssues?.get(issueId);
    if (!issueData) {
      alert('Issue data not found. Please scan for issues again.');
      return;
    }
    
    const { awardCode, classification, rateType, expectedRate, expectedSaturdayRate, penaltyDescription } = issueData;
    
    if (issueId.includes('sunday-rate') && expectedRate) {
      // Fix Sunday rate - try multiple possible descriptions
      const sundayDescriptions = [
        penaltyDescription || 'Sunday - ordinary hours',
        'Sunday - ordinary hours',
        'Sunday',
        'Sunday ordinary hours',
      ];
      
      let fixed = false;
      for (const desc of sundayDescriptions) {
        const key = `${awardCode}|${classification}|${desc}`;
        this.overrides.penaltyRates.set(key, expectedRate);
        fixed = true;
      }
      
      if (fixed) {
        this.saveConfiguration();
        this.renderMappings();
        this.ignoreIssue(issueId);
        alert(`✓ Fixed: Set Sunday rate override to $${expectedRate.toFixed(2)}/hr for ${awardCode} ${classification} (${rateType})\n\nPlease reload the main calculator page to see the changes.`);
      }
    } else if (issueId.includes('saturday-sunday') && expectedSaturdayRate) {
      // Fix Saturday rate to use flat ×1.25 rate
      const satDescriptions = [
        penaltyDescription || 'Saturday - ordinary hours',
        'Saturday - ordinary hours',
        'Saturday ordinary hours',
        'Saturday',
      ];
      
      let fixed = false;
      for (const desc of satDescriptions) {
        const key = `${awardCode}|${classification}|${desc}`;
        this.overrides.penaltyRates.set(key, expectedSaturdayRate);
        fixed = true;
      }
      
      // Also remove tiered Saturday rates if they exist
      const satFirstKey = `${awardCode}|${classification}|Saturday - first 3 hours`;
      const satAfterKey = `${awardCode}|${classification}|Saturday - after 3 hours`;
      this.overrides.penaltyRates.delete(satFirstKey);
      this.overrides.penaltyRates.delete(satAfterKey);
      
      if (fixed) {
        this.saveConfiguration();
        this.renderMappings();
        this.ignoreIssue(issueId);
        alert(`✓ Fixed: Set Saturday rate override to $${expectedSaturdayRate.toFixed(2)}/hr (flat ×1.25) for ${awardCode} ${classification} (${rateType})\n\nRemoved tiered Saturday rates. Please reload the main calculator page to see the changes.`);
      }
    } else {
      alert('Unable to auto-fix this issue. Please use the Penalty Rate Overrides section below to manually set the correct rate.');
    }
  }

  ignoreIssue(issueId) {
    this.ignoredIssues.add(issueId);
    this.saveConfiguration();
    const issueElement = document.getElementById(`issue-${issueId}`);
    if (issueElement) {
      issueElement.style.display = 'none';
    }
  }

  saveValidationRules() {
    this.validationRules = {
      validateSundayRate: document.getElementById('validateSundayRate').checked,
      validateSaturdaySunday: document.getElementById('validateSaturdaySunday').checked,
      rateTolerance: parseFloat(document.getElementById('rateTolerance').value) || 0.01,
      enforceMinimumEngagement: document.getElementById('enforceMinimumEngagement').checked,
      minimumEngagementHours: parseFloat(document.getElementById('minimumEngagementHours').value) || 3,
    };
    this.saveConfiguration();
    alert('Validation rules saved!');
  }

  clearAllOverrides() {
    this.overrides.classificationRates.clear();
    this.overrides.penaltyRates.clear();
    this.overrides.relationships = [];
    this.ignoredIssues.clear();
    this.saveConfiguration();
    this.renderMappings();
    this.renderOverrides();
    alert('All overrides cleared!');
  }

  exportConfiguration() {
    const config = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      overrides: {
        classificationRates: Array.from(this.overrides.classificationRates.entries()),
        penaltyRates: Array.from(this.overrides.penaltyRates.entries()),
        relationships: this.overrides.relationships,
      },
      validationRules: this.validationRules,
      ignoredIssues: Array.from(this.ignoredIssues),
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `award-interpreter-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importConfiguration(config) {
    if (config.overrides) {
      this.overrides.classificationRates = new Map(config.overrides.classificationRates || []);
      this.overrides.penaltyRates = new Map(config.overrides.penaltyRates || []);
      this.overrides.relationships = config.overrides.relationships || [];
    }
    if (config.validationRules) {
      this.validationRules = { ...this.validationRules, ...config.validationRules };
      // Update UI
      document.getElementById('validateSundayRate').checked = this.validationRules.validateSundayRate;
      document.getElementById('validateSaturdaySunday').checked = this.validationRules.validateSaturdaySunday;
      document.getElementById('rateTolerance').value = this.validationRules.rateTolerance;
      document.getElementById('enforceMinimumEngagement').checked = this.validationRules.enforceMinimumEngagement;
      document.getElementById('minimumEngagementHours').value = this.validationRules.minimumEngagementHours;
    }
    if (config.ignoredIssues) {
      this.ignoredIssues = new Set(config.ignoredIssues);
    }
    
    this.saveConfiguration();
    this.renderMappings();
    this.renderOverrides();
    alert('Configuration imported successfully!');
  }
}

// Initialize config manager when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.configManager = new ConfigManager();
    });
  } else {
    window.configManager = new ConfigManager();
  }
}

export default ConfigManager;