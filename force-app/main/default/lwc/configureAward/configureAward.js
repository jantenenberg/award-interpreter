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

export default class ConfigureAward extends LightningElement {
    @api recordId; // Award_Configuration__c record Id

    @track isLoading = true;
    @track errorMessage = '';

    // Context
    @track resourceName = '';
    @track isAlreadyConfigured = false;

    // Form state
    @track awardOptions = [];
    @track selectedAwardCode = '';
    @track selectedAwardName = '';
    @track selectedEmploymentType = '';
    @track classificationOptions = [];
    @track selectedClassification = '';
    @track selectedClassificationLevel = null;
    @track selectedClassificationValue = '';
    @track casualLoadingPercent = 25;
    @track effectiveDate = new Date().toISOString().slice(0, 10);
    @track ordinaryHourlyRate = null;
    @track rateWithLoading = null;

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

    get showRatePreview() {
        return this.ordinaryHourlyRate !== null;
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
        try {
            const config = await getCurrentConfiguration({ configId: this.recordId });
            this.resourceName = config.Resource__r?.Name || '';
            this.isAlreadyConfigured = config.Configured__c;

            if (config.Configured__c) {
                this.selectedAwardCode = config.Award_Code__c || '';
                this.selectedAwardName = config.Award_Name__c || '';
                this.selectedEmploymentType = config.Employment_Type__c || '';
                this.selectedClassification = config.Classification__c || '';
                this.selectedClassificationLevel = config.Classification_Level__c;
                this.casualLoadingPercent = config.Casual_Loading_Percent__c ?? 25;
                this.effectiveDate = config.Effective_Date__c || new Date().toISOString().slice(0, 10);
                this.ordinaryHourlyRate = config.Ordinary_Hourly_Rate__c
                    ? config.Ordinary_Hourly_Rate__c.toFixed(2)
                    : null;

                if (this.selectedAwardCode && this.selectedEmploymentType) {
                    await this.loadClassifications(false);
                }
            }
        } catch (e) {
            this.errorMessage = 'Failed to load configuration: ' + (e.body?.message || e.message);
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
                this.ordinaryHourlyRate = null;
                this.rateWithLoading = null;
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
                }),
            }));

            // Re-select existing classification when editing
            if (!resetSelection && this.selectedClassification) {
                const match = this.classificationOptions.find(opt => {
                    const parsed = JSON.parse(opt.value);
                    return parsed.classification === this.selectedClassification &&
                           parsed.level === this.selectedClassificationLevel;
                });
                if (match) {
                    this.selectedClassificationValue = match.value;
                    const parsed = JSON.parse(match.value);
                    if (parsed.baseRate) {
                        const base = parseFloat(parsed.baseRate);
                        this.ordinaryHourlyRate = base.toFixed(2);
                        this.updateRateWithLoading(base);
                    }
                }
            }
        } catch (e) {
            this.errorMessage = 'Failed to load classifications: ' + (e.body?.message || e.message);
        } finally {
            this.isLoading = false;
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
        if (parsed.baseRate) {
            const base = parseFloat(parsed.baseRate);
            this.ordinaryHourlyRate = base.toFixed(2);
            this.updateRateWithLoading(base);
        }
    }

    handleCasualLoadingChange(event) {
        this.casualLoadingPercent = parseFloat(event.detail.value) || 0;
        if (this.ordinaryHourlyRate) {
            this.updateRateWithLoading(parseFloat(this.ordinaryHourlyRate));
        }
    }

    handleEffectiveDateChange(event) {
        this.effectiveDate = event.detail.value;
    }

    updateRateWithLoading(baseRate) {
        const withLoading = baseRate * (1 + this.casualLoadingPercent / 100);
        this.rateWithLoading = withLoading.toFixed(2);
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
                ordinaryHourlyRate: this.isCasual && this.rateWithLoading
                    ? parseFloat(this.rateWithLoading)
                    : this.ordinaryHourlyRate
                        ? parseFloat(this.ordinaryHourlyRate)
                        : null,
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
