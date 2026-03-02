import { LightningElement, api, track } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';
import getAppointmentDetail from '@salesforce/apex/AppointmentCostController.getAppointmentDetail';
import getAppointmentResources from '@salesforce/apex/AppointmentCostController.getAppointmentResources';
import calculateCost from '@salesforce/apex/AppointmentCostController.calculateCost';

const SCHEDULED_STATUSES = new Set(['Scheduled']);
const ORDINARY_HOURS_THRESHOLD   = 9;
const MEAL_BREAK_THRESHOLD_HOURS = 5;
const STANDARD_MEAL_BREAK_MINS   = 30;

export default class AppointmentCost extends LightningElement {
    _recordId;
    _isConnected = false;

    @api
    get recordId() { return this._recordId; }
    set recordId(value) {
        const changed = this._recordId !== value;
        this._recordId = value;
        if (changed && value && this._isConnected) this.loadData();
    }

    @track isLoading = true;
    @track errorMessage = '';
    @track appointment = null;
    @track resources = [];
    @track selectedDateSet = 'scheduled';
    @track costResult = null;
    @track expandedResources = {};   // resourceId -> boolean (default true)

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async connectedCallback() {
        this._isConnected = true;
        try { await this.loadData(); }
        finally { this.isLoading = false; }
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

    get appointmentLoaded()       { return this.appointment != null; }
    get participantName()         { return this.appointment?.participantName || 'Appointment'; }
    get appointmentStatus()       { return this.appointment?.status || ''; }
    get resourceCount()           { return this.resources.length; }
    get hasResourcesWithoutAward(){ return this.resources.some(r => !r.hasAwardConfig); }
    get hasResults()              { return this.costResult != null; }

    get statusBadgeClass() {
        const s = this.appointment?.status || '';
        if (s === 'Scheduled')   return 'ca-status-badge ca-status-badge_scheduled';
        if (s === 'In Progress') return 'ca-status-badge ca-status-badge_inprogress';
        if (s === 'Completed')   return 'ca-status-badge ca-status-badge_completed';
        return 'ca-status-badge';
    }

    get dateSetOptions() {
        const appt = this.appointment;
        return [
            { value: 'scheduled',  label: 'Scheduled',   buttonClass: this._btnClass('scheduled'),  disabled: !appt?.scheduledStart },
            { value: 'actual',     label: 'Actual',       buttonClass: this._btnClass('actual'),     disabled: !appt?.actualStart },
            { value: 'checkinout', label: 'Check-in/out', buttonClass: this._btnClass('checkinout'), disabled: !this._anyResourceHasCheckInOut() },
        ];
    }

    get selectedDateStart() { return this._getDate('start'); }
    get selectedDateEnd()   { return this._getDate('end'); }

    get isCalculateDisabled() {
        return !this.selectedDateStart || !this.resources.some(r => r.hasAwardConfig);
    }

    get totalCostFormatted() {
        return this.costResult ? '$' + parseFloat(this.costResult.totalCost).toFixed(2) : '$0.00';
    }

    get totalHours() {
        return this.costResult?.totalHours ?? 0;
    }

    get showAdjustedTotal() {
        return (this.resourcePanels || []).some(rp => rp.hasAdjustedCost);
    }

    get adjustedTotalFormatted() {
        if (!this.resourcePanels?.length) return null;
        const total = this.resourcePanels.reduce((sum, rp) => {
            return sum + (rp.hasAdjustedCost ? rp.adjustedCost : parseFloat(rp.grossPay || 0));
        }, 0);
        return '$' + total.toFixed(2);
    }

    /**
     * Merged per-resource panels: cost data + explanation + expand/collapse state.
     * One entry per resource in costResult; this drives the per-resource sections in HTML.
     */
    get resourcePanels() {
        if (!this.costResult?.resources) return [];
        const explanations = this._buildExplanations(this.costResult);
        return this.costResult.resources.map(r => {
            const exp = explanations.find(e => e.resourceId === r.resourceId) || {};
            const empType = r.employmentType || '';
            const isExpanded = this.expandedResources[r.resourceId] !== false;
            return {
                // cost fields
                resourceId:           r.resourceId,
                resourceName:         r.resourceName,
                awardCode:            r.awardCode,
                employmentType:       empType,
                classification:       r.classification,
                classificationLevel:  r.classificationLevel,
                dayType:              r.dayType,
                paidHours:            parseFloat(r.paidHours).toFixed(2),
                grossPay:             parseFloat(r.grossPay),
                grossPayFormatted:    '$' + parseFloat(r.grossPay).toFixed(2),
                segments:             (r.segments || []).map(seg => ({
                    ...seg,
                    rateFormatted: '$' + parseFloat(seg.rate).toFixed(4),
                    costFormatted: '$' + parseFloat(seg.cost).toFixed(2),
                })),
                hasBackendWarnings:   r.warnings?.length > 0,
                backendWarningText:   r.warnings?.join('; ') || '',
                error:                r.error,
                // explanation fields
                appliedRules:         exp.appliedRules || [],
                noteWarnings:         exp.warnings || [],
                hasAppliedRules:      (exp.appliedRules || []).length > 0,
                hasNoteWarnings:      (exp.warnings || []).length > 0,
                adjustedCost:         exp.adjustedCost,
                adjustedCostFormatted: exp.adjustedCostFormatted,
                adjustmentDetail:     exp.adjustmentDetail,
                hasAdjustedCost:      exp.hasAdjustedCost || false,
                savingFormatted:      exp.savingFormatted,
                // display helpers
                empBadgeClass: [
                    'ca-emp-badge',
                    empType === 'CA' ? 'ca-emp-badge_casual' :
                    empType === 'FT' ? 'ca-emp-badge_ft' : 'ca-emp-badge_pt',
                ].join(' '),
                isExpanded,
                toggleIcon: isExpanded ? 'utility:chevronup' : 'utility:chevrondown',
            };
        });
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    handleDateSetChange(event) {
        this.selectedDateSet = event.currentTarget.dataset.value;
        this.costResult = null;
        this.expandedResources = {};
    }

    handleToggleResource(event) {
        const id = event.currentTarget.dataset.resourceId;
        const current = this.expandedResources[id] !== false;
        this.expandedResources = { ...this.expandedResources, [id]: !current };
    }

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
            this.costResult = result;
            // Default all resource panels to expanded
            const expanded = {};
            (result.resources || []).forEach(r => { expanded[r.resourceId] = true; });
            this.expandedResources = expanded;
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

    _buildExplanations(costResult) {
        if (!costResult?.resources) return [];
        return costResult.resources
            .filter(r => !r.error)
            .map(r => {
                const appliedRules = [];
                const warnings = [];
                const paidHours = parseFloat(r.paidHours  || 0);
                const ordRate   = parseFloat(r.ordinaryHourlyRate || 0);
                const grossPay  = parseFloat(r.grossPay   || 0);
                const segs      = r.segments || [];

                if (r.employmentType === 'CA') {
                    appliedRules.push({ id: 'ca', text: 'Casual loading is included in the base hourly rate used for all segments.' });
                }

                const hasSaturday  = segs.some(s => (s.penaltyKey || '').includes('saturday'));
                const hasSunday    = segs.some(s => s.penaltyKey === 'sunday');
                const hasPH        = segs.some(s => s.penaltyKey === 'publicholiday');
                const hasEarlyLate = segs.some(s => s.penaltyKey === 'weekday_early_late' || s.penaltyKey === 'friday_late');

                if (hasSaturday)  appliedRules.push({ id: 'sat', text: 'Saturday penalty rate ×1.25 applied (MA000004 cl.27.3).' });
                if (hasSunday)    appliedRules.push({ id: 'sun', text: 'Sunday penalty rate ×1.50 applied (MA000004 cl.27.4).' });
                if (hasPH)        appliedRules.push({ id: 'ph',  text: 'Public holiday rate ×2.25 applied (MA000004 cl.39).' });
                if (hasEarlyLate) appliedRules.push({ id: 'el',  text: 'Time-of-day penalty ×1.10 applied: hours before 7 am or after 6 pm (MA000004 cl.28.3).' });

                const otFirst3Seg  = segs.find(s => (s.description || '').includes('overtime - first 3'));
                const otBeyond3Seg = segs.find(s => (s.description || '').includes('overtime - beyond'));

                if (otFirst3Seg || otBeyond3Seg) {
                    appliedRules.push({ id: 'ot_thr', text: `Daily ordinary time limit of ${ORDINARY_HOURS_THRESHOLD} hours applied (MA000004 cl.28.1).` });
                }
                if (otFirst3Seg) {
                    const h = parseFloat(otFirst3Seg.hours).toFixed(1);
                    appliedRules.push({ id: 'ot_1', text: `Overtime ×1.5 applied for ${h}h (first 3 overtime hours, MA000004 cl.28.2(a)).` });
                }
                if (otBeyond3Seg) {
                    const h = parseFloat(otBeyond3Seg.hours).toFixed(1);
                    appliedRules.push({ id: 'ot_2', text: `Overtime ×2.0 applied for ${h}h (beyond 3 overtime hours, MA000004 cl.28.2(b)).` });
                }
                if (!otFirst3Seg && !otBeyond3Seg && r.dayType === 'weekday') {
                    appliedRules.push({ id: 'no_ot', text: `Shift is within the ${ORDINARY_HOURS_THRESHOLD}-hour daily threshold — ordinary time only.` });
                }
                if (r.dayType === 'saturday' || r.dayType === 'sunday') {
                    appliedRules.push({ id: 'wkend', text: 'Overtime rates do not apply on weekends — all hours paid at the flat weekend penalty rate.' });
                }
                const hasMinEng = segs.some(s => s.penaltyKey === 'minimum_engagement_padding');
                if (hasMinEng) {
                    appliedRules.push({ id: 'min', text: 'Casual minimum engagement of 3 hours applied (MA000004 cl.12.2).' });
                }

                let adjustedCost = null, adjustmentDetail = null;

                if (paidHours > MEAL_BREAK_THRESHOLD_HOURS) {
                    const breakHours    = STANDARD_MEAL_BREAK_MINS / 60;
                    const savedRate     = otFirst3Seg ? parseFloat(otFirst3Seg.rate) : ordRate;
                    const saving        = breakHours * savedRate;
                    adjustedCost        = grossPay - saving;
                    adjustmentDetail    = `${STANDARD_MEAL_BREAK_MINS} min × $${savedRate.toFixed(4)}/hr ≈ $${saving.toFixed(2)} saving`;

                    warnings.push({
                        id: 'mb',
                        text: `Unpaid meal break not deducted (MA000004 cl.34.1): shifts over ${MEAL_BREAK_THRESHOLD_HOURS} hours require a 30–60 min unpaid meal break. A standard 30-min break has not been applied.`,
                    });
                }
                if ((r.dayType === 'saturday' || r.dayType === 'sunday') && paidHours > ORDINARY_HOURS_THRESHOLD) {
                    warnings.push({
                        id: 'wkend_long',
                        text: `This ${r.dayType} shift exceeds ${ORDINARY_HOURS_THRESHOLD} hours. Overtime rates do not apply on weekends under MA000004.`,
                    });
                }

                return {
                    resourceId:            r.resourceId,
                    appliedRules,
                    warnings,
                    hasAdjustedCost:       adjustedCost != null,
                    adjustedCost,
                    adjustedCostFormatted: adjustedCost != null ? '$' + adjustedCost.toFixed(2) : null,
                    adjustmentDetail,
                    savingFormatted:       adjustedCost != null ? '$' + (grossPay - adjustedCost).toFixed(2) : null,
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
        if (this.selectedDateSet === 'checkinout') {
            const first = this.resources.find(r => r.checkInTime);
            if (!first) return null;
            return startOrEnd === 'start' ? this._fmt(first.checkInTime) : this._fmt(first.checkOutTime);
        }
        const pairs = {
            scheduled: [appt.scheduledStart, appt.scheduledEnd],
            actual:    [appt.actualStart,    appt.actualEnd],
        };
        const val = pairs[this.selectedDateSet]?.[startOrEnd === 'start' ? 0 : 1];
        return val ? this._fmt(val) : null;
    }

    _fmt(iso) {
        if (!iso) return null;
        try {
            return new Date(iso).toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
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
}
