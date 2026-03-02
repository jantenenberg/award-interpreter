import { LightningElement, api, track } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';
import getAppointmentDetail from '@salesforce/apex/AppointmentCostController.getAppointmentDetail';
import getAppointmentResources from '@salesforce/apex/AppointmentCostController.getAppointmentResources';
import calculateCost from '@salesforce/apex/AppointmentCostController.calculateCost';

const SCHEDULED_STATUSES = new Set(['Scheduled']);

// MA000004 award rule thresholds used for explanation generation
const ORDINARY_HOURS_THRESHOLD = 9;
const MEAL_BREAK_THRESHOLD_HOURS = 5;
const STANDARD_MEAL_BREAK_MINUTES = 30;

export default class AppointmentCost extends LightningElement {
    _recordId;
    _isConnected = false;

    @api
    get recordId() { return this._recordId; }
    set recordId(value) {
        const changed = this._recordId !== value;
        this._recordId = value;
        if (changed && value && this._isConnected) {
            this.loadData();
        }
    }

    @track isLoading = true;
    @track isCalculating = false;
    @track errorMessage = '';

    @track appointment = null;
    @track resources = [];
    @track selectedDateSet = 'scheduled';
    @track costResult = null;
    @track resultsExpanded = true;
    @track notesExpanded = true;
    @track explanations = [];

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async connectedCallback() {
        this._isConnected = true;
        try {
            await this.loadData();
        } finally {
            this.isLoading = false;
        }
    }

    async loadData() {
        if (!this._recordId) return;
        try {
            const [appt, rawResources] = await Promise.all([
                getAppointmentDetail({ appointmentId: this._recordId }),
                getAppointmentResources({ appointmentId: this._recordId }),
            ]);
            this.appointment = appt;
            this.resources = this._enrichResources(rawResources);
            this.selectedDateSet = SCHEDULED_STATUSES.has(appt?.status) ? 'scheduled' : 'actual';
        } catch (e) {
            this.errorMessage = 'Failed to load appointment: ' + (e.body?.message || e.message);
        }
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get appointmentLoaded() { return this.appointment != null; }

    get participantName() { return this.appointment?.participantName || 'Appointment'; }

    get appointmentStatus() { return this.appointment?.status || ''; }

    get statusBadgeClass() {
        const s = this.appointment?.status || '';
        if (s === 'Scheduled')  return 'ca-status-badge ca-status-badge_scheduled';
        if (s === 'In Progress') return 'ca-status-badge ca-status-badge_inprogress';
        if (s === 'Completed')  return 'ca-status-badge ca-status-badge_completed';
        return 'ca-status-badge';
    }

    get dateSetOptions() {
        const appt = this.appointment;
        return [
            { value: 'scheduled',  label: 'Scheduled',    buttonClass: this._btnClass('scheduled'),  disabled: !appt?.scheduledStart },
            { value: 'actual',     label: 'Actual',        buttonClass: this._btnClass('actual'),     disabled: !appt?.actualStart },
            { value: 'checkinout', label: 'Check-in/out',  buttonClass: this._btnClass('checkinout'), disabled: !this._anyResourceHasCheckInOut() },
        ];
    }

    get selectedDateStart() { return this._getDate('start'); }
    get selectedDateEnd()   { return this._getDate('end'); }
    get resourceCount()     { return this.resources.length; }

    get hasResourcesWithoutAward() {
        return this.resources.some(r => !r.hasAwardConfig);
    }

    get isCalculateDisabled() {
        return !this.selectedDateStart || !this.resources.some(r => r.hasAwardConfig);
    }

    get resultsToggleIcon() { return this.resultsExpanded ? 'utility:chevronup' : 'utility:chevrondown'; }
    get notesToggleIcon()   { return this.notesExpanded   ? 'utility:chevronup' : 'utility:chevrondown'; }

    get totalCostFormatted() {
        if (!this.costResult) return '$0.00';
        return '$' + parseFloat(this.costResult.totalCost).toFixed(2);
    }

    get hasNotes() { return this.explanations && this.explanations.length > 0; }

    get totalAdjustedCostFormatted() {
        if (!this.explanations?.length) return null;
        const total = this.explanations.reduce((sum, e) => {
            return sum + (e.adjustedCost != null ? e.adjustedCost : parseFloat(e.grossPay || 0));
        }, 0);
        // Only show if at least one resource has an adjustment
        const hasAny = this.explanations.some(e => e.adjustedCost != null);
        return hasAny ? '$' + total.toFixed(2) : null;
    }

    get showCostComparison() {
        return this.totalAdjustedCostFormatted != null &&
               this.totalAdjustedCostFormatted !== this.totalCostFormatted;
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    handleDateSetChange(event) {
        this.selectedDateSet = event.currentTarget.dataset.value;
        this.costResult = null;
        this.explanations = [];
    }

    handleToggleResults() { this.resultsExpanded = !this.resultsExpanded; }
    handleToggleNotes()   { this.notesExpanded   = !this.notesExpanded; }

    async handleCalculate() {
        this.errorMessage = '';
        this.isLoading = true;
        try {
            const result = await calculateCost({
                appointmentId: this._recordId,
                dateSetType:   this.selectedDateSet,
                startOverride: null,
                endOverride:   null,
            });
            this.costResult = this._enrichCostResult(result);
            this.explanations = this._generateExplanations(this.costResult);
            this.resultsExpanded = true;
            this.notesExpanded = true;
        } catch (e) {
            this.errorMessage = 'Calculation failed: ' + (e.body?.message || e.message);
        } finally {
            this.isLoading = false;
        }
    }

    handleClose() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }

    // ── Explanation engine ────────────────────────────────────────────────────

    _generateExplanations(costResult) {
        if (!costResult?.resources) return [];
        return costResult.resources
            .filter(r => !r.error)
            .map(r => {
                const appliedRules = [];
                const warnings = [];
                const paidHours   = parseFloat(r.paidHours  || 0);
                const ordRate     = parseFloat(r.ordinaryHourlyRate || 0);
                const grossPay    = parseFloat(r.grossPay   || 0);
                const segs        = r.segments || [];

                // ── Employment type ───────────────────────────────────────────
                if (r.employmentType === 'CA') {
                    appliedRules.push({
                        id: 'ca',
                        icon: 'utility:check',
                        text: 'Casual loading is included in the base hourly rate used for all segments.',
                    });
                }

                // ── Day-type penalties ────────────────────────────────────────
                const hasSaturday  = segs.some(s => (s.penaltyKey || '').includes('saturday'));
                const hasSunday    = segs.some(s => s.penaltyKey === 'sunday');
                const hasPH        = segs.some(s => s.penaltyKey === 'publicholiday');
                const hasEarlyLate = segs.some(s => s.penaltyKey === 'weekday_early_late' || s.penaltyKey === 'friday_late');

                if (hasSaturday)  appliedRules.push({ id: 'sat', icon: 'utility:check', text: 'Saturday penalty rate ×1.25 applied (MA000004 cl.27.3).' });
                if (hasSunday)    appliedRules.push({ id: 'sun', icon: 'utility:check', text: 'Sunday penalty rate ×1.50 applied (MA000004 cl.27.4).' });
                if (hasPH)        appliedRules.push({ id: 'ph',  icon: 'utility:check', text: 'Public holiday rate ×2.25 applied (MA000004 cl.39).' });
                if (hasEarlyLate) appliedRules.push({ id: 'el',  icon: 'utility:check', text: 'Time-of-day penalty ×1.10 applied: hours worked before 7 am or after 6 pm on a weekday (MA000004 cl.28.3).' });

                // ── Overtime ──────────────────────────────────────────────────
                const otFirst3Seg  = segs.find(s => (s.description || '').includes('overtime - first 3'));
                const otBeyond3Seg = segs.find(s => (s.description || '').includes('overtime - beyond'));

                if (otFirst3Seg || otBeyond3Seg) {
                    appliedRules.push({
                        id: 'ot_threshold',
                        icon: 'utility:check',
                        text: `Daily ordinary time limit of ${ORDINARY_HOURS_THRESHOLD} hours applied (MA000004 cl.28.1). Hours beyond this threshold attract overtime rates.`,
                    });
                }
                if (otFirst3Seg) {
                    const otHrs = parseFloat(otFirst3Seg.hours).toFixed(1);
                    appliedRules.push({
                        id: 'ot_first3',
                        icon: 'utility:check',
                        text: `Overtime ×1.5 applied for ${otHrs} hour${otHrs !== '1.0' ? 's' : ''} (first 3 overtime hours, MA000004 cl.28.2(a)).`,
                    });
                }
                if (otBeyond3Seg) {
                    const beyondHrs = parseFloat(otBeyond3Seg.hours).toFixed(1);
                    appliedRules.push({
                        id: 'ot_beyond3',
                        icon: 'utility:check',
                        text: `Overtime ×2.0 applied for ${beyondHrs} hour${beyondHrs !== '1.0' ? 's' : ''} (beyond 3 overtime hours, MA000004 cl.28.2(b)).`,
                    });
                }
                if (!otFirst3Seg && !otBeyond3Seg && r.dayType === 'weekday') {
                    appliedRules.push({
                        id: 'no_ot',
                        icon: 'utility:check',
                        text: `Shift is within the ${ORDINARY_HOURS_THRESHOLD}-hour daily ordinary time threshold — no overtime applies.`,
                    });
                }
                if (r.dayType === 'saturday' || r.dayType === 'sunday') {
                    appliedRules.push({
                        id: 'no_wkend_ot',
                        icon: 'utility:check',
                        text: 'Overtime rates do not apply on weekends under MA000004 — all hours paid at the flat weekend penalty rate.',
                    });
                }

                // Minimum engagement
                const hasMinEng = segs.some(s => s.penaltyKey === 'minimum_engagement_padding');
                if (hasMinEng) {
                    appliedRules.push({
                        id: 'min_eng',
                        icon: 'utility:check',
                        text: 'Casual minimum engagement of 3 hours applied (MA000004 cl.12.2).',
                    });
                }

                // ── Adjusted cost calculation ─────────────────────────────────
                let adjustedCost       = null;
                let adjustmentDetail   = null;

                // Meal break warning (only if shift > 5h and no break was deducted)
                if (paidHours > MEAL_BREAK_THRESHOLD_HOURS) {
                    const breakHours = STANDARD_MEAL_BREAK_MINUTES / 60;

                    // The break removes 0.5h from the paid hours total.
                    // These saved hours come from the overtime tail (if overtime exists),
                    // otherwise from ordinary time.
                    const savedSegRate = otFirst3Seg
                        ? parseFloat(otFirst3Seg.rate)
                        : ordRate;
                    const saving = breakHours * savedSegRate;
                    adjustedCost = grossPay - saving;
                    adjustmentDetail = `${STANDARD_MEAL_BREAK_MINUTES} min unpaid break × $${savedSegRate.toFixed(4)}/hr ≈ $${saving.toFixed(2)} saving`;

                    warnings.push({
                        id: 'meal_break',
                        icon: 'utility:warning',
                        text: `Unpaid meal break not deducted (MA000004 cl.34.1): shifts exceeding ${MEAL_BREAK_THRESHOLD_HOURS} hours must include a 30–60 min unpaid meal break. A standard 30-min break has not been applied to this calculation.`,
                    });
                }

                // Weekend overtime note (only for long weekend shifts)
                if ((r.dayType === 'saturday' || r.dayType === 'sunday') && paidHours > ORDINARY_HOURS_THRESHOLD) {
                    warnings.push({
                        id: 'wkend_long',
                        icon: 'utility:info',
                        text: `This ${r.dayType} shift exceeds ${ORDINARY_HOURS_THRESHOLD} hours. Note that overtime penalty rates do not apply on weekends under MA000004 — all hours are paid at the flat weekend rate.`,
                    });
                }

                return {
                    resourceId:              r.resourceId,
                    resourceName:            r.resourceName,
                    appliedRules,
                    warnings,
                    hasAppliedRules:         appliedRules.length > 0,
                    hasWarnings:             warnings.length > 0,
                    grossPay:                grossPay,
                    grossPayFormatted:       '$' + grossPay.toFixed(2),
                    adjustedCost:            adjustedCost,
                    adjustedCostFormatted:   adjustedCost != null ? '$' + adjustedCost.toFixed(2) : null,
                    adjustmentDetail:        adjustmentDetail,
                    hasAdjustedCost:         adjustedCost != null,
                    savingFormatted:         adjustedCost != null
                        ? '$' + (grossPay - adjustedCost).toFixed(2) : null,
                };
            });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _btnClass(value) {
        return ['ca-type-btn', this.selectedDateSet === value ? 'ca-type-btn_active' : '']
            .filter(Boolean).join(' ');
    }

    _getDate(startOrEnd) {
        const appt = this.appointment;
        if (!appt) return null;
        const pairs = {
            scheduled:  [appt.scheduledStart, appt.scheduledEnd],
            actual:     [appt.actualStart,    appt.actualEnd],
            checkinout: [null, null],
        };
        if (this.selectedDateSet === 'checkinout') {
            const first = this.resources.find(r => r.checkInTime);
            if (!first) return null;
            return startOrEnd === 'start'
                ? this._formatDisplay(first.checkInTime)
                : this._formatDisplay(first.checkOutTime);
        }
        const val = pairs[this.selectedDateSet]?.[startOrEnd === 'start' ? 0 : 1];
        return val ? this._formatDisplay(val) : null;
    }

    _formatDisplay(iso) {
        if (!iso) return null;
        try {
            const d = new Date(iso);
            return d.toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit',
            });
        } catch { return iso; }
    }

    _anyResourceHasCheckInOut() {
        return this.resources.some(r => r.checkInTime && r.checkOutTime);
    }

    _enrichResources(raw) {
        return (raw || []).map(r => ({
            ...r,
            employmentTypeBadgeClass: [
                'ca-emp-badge',
                r.employmentType === 'CA' ? 'ca-emp-badge_casual' :
                r.employmentType === 'FT' ? 'ca-emp-badge_ft' : 'ca-emp-badge_pt',
            ].join(' '),
        }));
    }

    _enrichCostResult(result) {
        return {
            ...result,
            resources: (result.resources || []).map(r => ({
                ...r,
                grossPayFormatted: '$' + parseFloat(r.grossPay).toFixed(2),
                paidHours:         parseFloat(r.paidHours).toFixed(2),
                hasWarnings:       r.warnings?.length > 0,
                warningText:       r.warnings?.join('; ') || '',
                segments: (r.segments || []).map(seg => ({
                    ...seg,
                    rateFormatted: '$' + parseFloat(seg.rate).toFixed(4),
                    costFormatted: '$' + parseFloat(seg.cost).toFixed(2),
                })),
            })),
        };
    }
}
