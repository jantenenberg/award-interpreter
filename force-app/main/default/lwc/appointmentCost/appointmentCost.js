import { LightningElement, api, track } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';
import getAppointmentDetail from '@salesforce/apex/AppointmentCostController.getAppointmentDetail';
import getAppointmentResources from '@salesforce/apex/AppointmentCostController.getAppointmentResources';
import calculateCost from '@salesforce/apex/AppointmentCostController.calculateCost';

const DATE_SET_LABELS = {
    scheduled: 'Scheduled',
    actual:    'Actual',
    checkinout: 'Check-in/out',
};

const SCHEDULED_STATUSES = new Set(['Scheduled']);

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

    @track appointment = null;     // AppointmentDetail from Apex
    @track resources = [];         // AppointmentResourceDetail[] enriched for display
    @track selectedDateSet = 'scheduled';
    @track costResult = null;
    @track resultsExpanded = true;

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

            // Default date set based on status (rule: Scheduled → scheduled dates, else → actual)
            this.selectedDateSet = SCHEDULED_STATUSES.has(appt?.status) ? 'scheduled' : 'actual';
        } catch (e) {
            this.errorMessage = 'Failed to load appointment: ' + (e.body?.message || e.message);
        }
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get participantName() {
        return this.appointment?.participantName || 'Appointment';
    }

    get statusBadgeClass() {
        const s = this.appointment?.status || '';
        if (s === 'Scheduled') return 'ca-status-badge ca-status-badge_scheduled';
        if (s === 'In Progress') return 'ca-status-badge ca-status-badge_inprogress';
        if (s === 'Completed')  return 'ca-status-badge ca-status-badge_completed';
        return 'ca-status-badge';
    }

    get dateSetOptions() {
        const appt = this.appointment;
        return [
            {
                value: 'scheduled',
                label: 'Scheduled',
                buttonClass: this._btnClass('scheduled'),
                disabled: !appt?.scheduledStart,
            },
            {
                value: 'actual',
                label: 'Actual',
                buttonClass: this._btnClass('actual'),
                disabled: !appt?.actualStart,
            },
            {
                value: 'checkinout',
                label: 'Check-in/out',
                buttonClass: this._btnClass('checkinout'),
                disabled: !this._anyResourceHasCheckInOut(),
            },
        ];
    }

    get selectedDateStart() {
        return this._getDate('start');
    }

    get selectedDateEnd() {
        return this._getDate('end');
    }

    get resourceCount() {
        return this.resources.length;
    }

    get hasResourcesWithoutAward() {
        return this.resources.some(r => !r.hasAwardConfig);
    }

    get isCalculateDisabled() {
        return !this.selectedDateStart ||
               !this.resources.some(r => r.hasAwardConfig);
    }

    get resultsToggleIcon() {
        return this.resultsExpanded ? 'utility:chevronup' : 'utility:chevrondown';
    }

    get totalCostFormatted() {
        if (!this.costResult) return '$0.00';
        return '$' + parseFloat(this.costResult.totalCost).toFixed(2);
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    handleDateSetChange(event) {
        this.selectedDateSet = event.currentTarget.dataset.value;
        this.costResult = null;  // clear stale results when date set changes
    }

    handleToggleResults() {
        this.resultsExpanded = !this.resultsExpanded;
    }

    async handleCalculate() {
        this.errorMessage = '';
        this.isCalculating = true;
        this.isLoading = true;
        try {
            const result = await calculateCost({
                appointmentId: this._recordId,
                dateSetType:   this.selectedDateSet,
                startOverride: null,
                endOverride:   null,
            });
            this.costResult = this._enrichCostResult(result);
            this.resultsExpanded = true;
        } catch (e) {
            this.errorMessage = 'Calculation failed: ' + (e.body?.message || e.message);
        } finally {
            this.isCalculating = false;
            this.isLoading = false;
        }
    }

    handleClose() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _btnClass(value) {
        return [
            'ca-type-btn',
            this.selectedDateSet === value ? 'ca-type-btn_active' : '',
        ].filter(Boolean).join(' ');
    }

    _getDate(startOrEnd) {
        const appt = this.appointment;
        if (!appt) return null;
        const key = startOrEnd === 'start' ? 0 : 1;
        const pairs = {
            scheduled:  [appt.scheduledStart, appt.scheduledEnd],
            actual:     [appt.actualStart,    appt.actualEnd],
            checkinout: [null, null],  // per-resource; show first resource's times if available
        };
        if (this.selectedDateSet === 'checkinout') {
            const first = this.resources.find(r => r.checkInTime);
            if (!first) return null;
            return key === 0 ? this._formatDisplay(first.checkInTime) : this._formatDisplay(first.checkOutTime);
        }
        const val = pairs[this.selectedDateSet]?.[key];
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
        } catch {
            return iso;
        }
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
                paidHours: parseFloat(r.paidHours).toFixed(2),
                hasWarnings: r.warnings && r.warnings.length > 0,
                warningText: r.warnings ? r.warnings.join('; ') : '',
                segments: (r.segments || []).map(seg => ({
                    ...seg,
                    rateFormatted: '$' + parseFloat(seg.rate).toFixed(4),
                    costFormatted: '$' + parseFloat(seg.cost).toFixed(2),
                })),
            })),
        };
    }
}
