import { LightningElement, api, track } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAwards from '@salesforce/apex/AwardConfigurationController.getAwards';
import getClassifications from '@salesforce/apex/AwardConfigurationController.getClassifications';
import saveConfiguration from '@salesforce/apex/AwardConfigurationController.saveConfiguration';
import getCurrentConfiguration from '@salesforce/apex/AwardConfigurationController.getCurrentConfiguration';

const EMPLOYMENT_TYPE_OPTIONS = [
    { label: 'Full-time', value: 'FT' },
    { label: 'Part-time', value: 'PT' },
    { label: 'Casual', value: 'CA' },
];

const STANDARD_HOURS_PER_WEEK = 38;

export default class ConfigureAward extends LightningElement {
    @api recordId;

    @track isLoading = true;
    @track errorMessage = '';

    // Context
    @track resourceName = '';
    @track isAlreadyConfigured = false;

    // Award / employment type
    @track awardOptions = [];
    @track selectedAwardCode = '';
    @track selectedAwardName = '';
    @track selectedEmploymentType = '';

    // Classification
    @track classificationOptions = [];
    @track selectedClassification = '';
    @track selectedClassificationLevel = null;
    @track selectedClassificationValue = '';

    // Rate data from API (readonly reference values)
    @track apiBaseRate = null;          // weekly base rate, e.g. 1008.90
    @track apiBaseRateType = '';        // e.g. "Weekly"
    @track apiCalculatedRate = null;    // base hourly (no casual loading), e.g. 26.55
    @track apiCalculatedRateType = '';  // e.g. "Hourly"

    // Editable / save fields
    @track casualLoadingPercent = 25;
    @track effectiveDate = new Date().toISOString().slice(0, 10);
    @track editableRate = null;         // user-editable; defaults to rate-with-loading

    get employmentTypeOptions() {
        return EMPLOYMENT_TYPE_OPTIONS;
    }

    get isCasual() {
        return this.selectedEmploymentType === 'CA';
    }

    get showClassifications() {
        return this.selectedAwardCode &&
               this.selectedEmploymentType &&
               this.classificationOptions.length > 0;
    }

    get showClassificationSummary() {
        return !!this.selectedClassification;
    }

    // Formatted base rate label, e.g. "$1008.90/week"
    get baseRateLabel() {
        if (this.apiBaseRate == null) return '—';
        const unit = (this.apiBaseRateType || 'week').toLowerCase();
        return `$${parseFloat(this.apiBaseRate).toFixed(2)}/${unit}`;
    }

    // Calculated rate type label, e.g. "Hourly"
    get calculatedRateTypeLabel() {
        return this.apiCalculatedRateType || 'Hourly';
    }

    get isSaveDisabled() {
        return !this.selectedAwardCode ||
               !this.selectedEmploymentType ||
               !this.selectedClassification ||
               !this.effectiveDate;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async connectedCallback() {
        try {
            await Promise.all([
                this.loadCurrentConfig(),
                this.loadAwards(),
            ]);
        } finally {
            this.isLoading = false;
        }
    }

    // ── Data loading ──────────────────────────────────────────────────────────

    async loadCurrentConfig() {
        // No record context — new record or action launched outside a record page
        if (!this.recordId) return;
        try {
            const config = await getCurrentConfiguration({ configId: this.recordId });
            if (config == null) return;

            this.resourceName = config?.Resource__r?.Name ?? '';
            this.isAlreadyConfigured = config?.Configured__c ?? false;

            if (config.Configured__c) {
                this.selectedAwardCode = config?.Award_Code__c ?? '';
                this.selectedAwardName = config?.Award_Name__c ?? '';
                this.selectedEmploymentType = config?.Employment_Type__c ?? '';
                this.selectedClassification = config?.Classification__c ?? '';
                this.selectedClassificationLevel = config?.Classification_Level__c ?? null;
                this.casualLoadingPercent = config?.Casual_Loading_Percent__c ?? 25;
                this.effectiveDate = config?.Effective_Date__c ?? new Date().toISOString().slice(0, 10);
                this.editableRate = config?.Ordinary_Hourly_Rate__c != null
                    ? config.Ordinary_Hourly_Rate__c.toFixed(4)
                    : null;

                if (this.selectedAwardCode && this.selectedEmploymentType) {
                    await this.loadClassifications(false);
                }
            }
        } catch (e) {
            // Swallow errors that simply mean no configuration exists yet
            const msg = e?.body?.message ?? e?.message ?? '';
            if (msg.includes('no rows') || msg.includes('Resource__r') || msg.includes('null')) return;
            this.errorMessage = 'Failed to load configuration: ' + msg;
        }
    }

    async loadAwards() {
        try {
            const awards = await getAwards();
            this.awardOptions = awards.map(a => ({
                label: `${a.awardCode} — ${a.awardTitle}`,
                value: a.awardCode,
                awardTitle: a.awardTitle,
            }));
        } catch (e) {
            this.errorMessage = 'Failed to load awards: ' + (e.body?.message || e.message);
        }
    }

    async loadClassifications(resetSelection = true) {
        if (!this.selectedAwardCode || !this.selectedEmploymentType) return;
        try {
            this.isLoading = true;
            if (resetSelection) {
                this.selectedClassification = '';
                this.selectedClassificationLevel = null;
                this.selectedClassificationValue = '';
                this.apiBaseRate = null;
                this.apiBaseRateType = '';
                this.apiCalculatedRate = null;
                this.apiCalculatedRateType = '';
                this.editableRate = null;
            }

            const results = await getClassifications({
                awardCode: this.selectedAwardCode,
                employmentType: this.selectedEmploymentType,
            });

            this.classificationOptions = results.map(c => ({
                label: `Level ${c.classificationLevel} — ${c.classification}`,
                value: JSON.stringify({
                    classification: c.classification,
                    level: c.classificationLevel,
                    baseRate: c.baseRate,
                    baseRateType: c.baseRateType,
                    calculatedRate: c.calculatedRate,
                    calculatedRateType: c.calculatedRateType,
                }),
            }));

            // Re-select the saved classification when editing
            if (!resetSelection && this.selectedClassification) {
                const match = this.classificationOptions.find(opt => {
                    const p = JSON.parse(opt.value);
                    return p.classification === this.selectedClassification &&
                           p.level === this.selectedClassificationLevel;
                });
                if (match) {
                    this.selectedClassificationValue = match.value;
                    this._applyClassificationData(JSON.parse(match.value), false);
                }
            }
        } catch (e) {
            this.errorMessage = 'Failed to load classifications: ' + (e.body?.message || e.message);
        } finally {
            this.isLoading = false;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Populate rate state from a parsed classification value object. */
    _applyClassificationData(parsed, resetEditableRate = true) {
        this.apiBaseRate = parsed.baseRate ? parseFloat(parsed.baseRate) : null;
        this.apiBaseRateType = parsed.baseRateType || 'Weekly';
        this.apiCalculatedRateType = parsed.calculatedRateType || 'Hourly';

        // Derive hourly rate: use calculatedRate from API if available,
        // otherwise fall back to base_rate / standard hours.
        let hourlyBase = null;
        if (parsed.calculatedRate) {
            hourlyBase = parseFloat(parsed.calculatedRate);
        } else if (parsed.baseRate) {
            hourlyBase = parseFloat(parsed.baseRate) / STANDARD_HOURS_PER_WEEK;
        }
        this.apiCalculatedRate = hourlyBase;

        if (resetEditableRate && hourlyBase !== null) {
            // Apply casual loading to the editable default rate
            const withLoading = this.isCasual
                ? hourlyBase * (1 + this.casualLoadingPercent / 100)
                : hourlyBase;
            this.editableRate = withLoading.toFixed(4);
        }
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    handleAwardChange(event) {
        this.selectedAwardCode = event.detail.value;
        const opt = this.awardOptions.find(a => a.value === this.selectedAwardCode);
        this.selectedAwardName = opt ? opt.awardTitle : '';
        this.loadClassifications(true);
    }

    handleEmploymentTypeChange(event) {
        this.selectedEmploymentType = event.detail.value;
        this.casualLoadingPercent = this.selectedEmploymentType === 'CA' ? 25 : 0;
        this.loadClassifications(true);
    }

    handleClassificationChange(event) {
        this.selectedClassificationValue = event.detail.value;
        const parsed = JSON.parse(event.detail.value);
        this.selectedClassification = parsed.classification;
        this.selectedClassificationLevel = parsed.level;
        this._applyClassificationData(parsed, true);
    }

    handleCasualLoadingChange(event) {
        this.casualLoadingPercent = parseFloat(event.detail.value) || 0;
        // Recalculate editable rate when loading % changes
        if (this.apiCalculatedRate !== null) {
            const withLoading = this.isCasual
                ? this.apiCalculatedRate * (1 + this.casualLoadingPercent / 100)
                : this.apiCalculatedRate;
            this.editableRate = withLoading.toFixed(4);
        }
    }

    handleEffectiveDateChange(event) {
        this.effectiveDate = event.detail.value;
    }

    handleRateChange(event) {
        this.editableRate = event.detail.value;
    }

    async handleSave() {
        this.errorMessage = '';
        this.isLoading = true;
        try {
            await saveConfiguration({
                configId: this.recordId,
                awardCode: this.selectedAwardCode,
                awardName: this.selectedAwardName,
                employmentType: this.selectedEmploymentType,
                classification: this.selectedClassification,
                classificationLevel: this.selectedClassificationLevel,
                casualLoadingPercent: this.isCasual ? this.casualLoadingPercent : null,
                effectiveDate: this.effectiveDate,
                ordinaryHourlyRate: this.editableRate ? parseFloat(this.editableRate) : null,
            });

            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Award configuration saved.',
                variant: 'success',
            }));
            this.dispatchEvent(new CloseActionScreenEvent());
        } catch (e) {
            this.errorMessage = 'Save failed: ' + (e.body?.message || e.message);
        } finally {
            this.isLoading = false;
        }
    }

    handleCancel() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }
}
