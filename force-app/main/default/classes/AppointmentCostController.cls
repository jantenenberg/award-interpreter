public without sharing class AppointmentCostController {

    private static final String SETTINGS_RECORD = 'Default';

    private static Award_Interpreter_Settings__mdt getSettings() {
        return [
            SELECT Org_ID__c, API_Key__c, API_Base_URL__c
            FROM Award_Interpreter_Settings__mdt
            WHERE DeveloperName = :SETTINGS_RECORD
            LIMIT 1
        ];
    }

    // ── Inner classes ─────────────────────────────────────────────────────────

    public class AppointmentDetail {
        @AuraEnabled public String appointmentId;
        @AuraEnabled public String status;
        @AuraEnabled public String participantName;
        // Scheduled
        @AuraEnabled public String scheduledStart;
        @AuraEnabled public String scheduledEnd;
        // Actual
        @AuraEnabled public String actualStart;
        @AuraEnabled public String actualEnd;
        // Check-in/out
        @AuraEnabled public String checkIn;
        @AuraEnabled public String checkOut;
    }

    public class AppointmentResourceDetail {
        @AuraEnabled public String resourceId;
        @AuraEnabled public String resourceName;
        @AuraEnabled public String awardConfigId;
        @AuraEnabled public String awardCode;
        @AuraEnabled public String employmentType;
        @AuraEnabled public String classification;
        @AuraEnabled public Integer classificationLevel;
        @AuraEnabled public Decimal casualLoadingPercent;
        @AuraEnabled public Decimal ordinaryHourlyRate;
        // Resource-level check-in/out (may differ from appointment-level)
        @AuraEnabled public String checkInTime;
        @AuraEnabled public String checkOutTime;
        @AuraEnabled public String actualStart;
        @AuraEnabled public String actualEnd;
        @AuraEnabled public Boolean hasAwardConfig;
    }

    public class CostSegment {
        @AuraEnabled public String description;
        @AuraEnabled public Decimal hours;
        @AuraEnabled public Decimal rate;
        @AuraEnabled public Decimal cost;
        @AuraEnabled public String penaltyKey;
    }

    public class ResourceCostResult {
        @AuraEnabled public String resourceId;
        @AuraEnabled public String resourceName;
        @AuraEnabled public String awardCode;
        @AuraEnabled public String employmentType;
        @AuraEnabled public String classification;
        @AuraEnabled public Integer classificationLevel;
        @AuraEnabled public Decimal ordinaryHourlyRate;
        @AuraEnabled public Decimal paidHours;
        @AuraEnabled public Decimal grossPay;
        @AuraEnabled public String dayType;
        @AuraEnabled public List<CostSegment> segments;
        @AuraEnabled public List<String> warnings;
        @AuraEnabled public String error;
    }

    public class AppointmentCostResult {
        @AuraEnabled public String appointmentId;
        @AuraEnabled public Decimal totalCost;
        @AuraEnabled public Decimal totalHours;
        @AuraEnabled public List<ResourceCostResult> resources;
        @AuraEnabled public List<String> warnings;
    }

    public class ExistingBreakInfo {
        @AuraEnabled public String resourceId;
        @AuraEnabled public Integer durationMins;
    }

    public class BreakRequest {
        @AuraEnabled public String resourceId;
        @AuraEnabled public String breakStartIso;
        @AuraEnabled public String breakEndIso;
        @AuraEnabled public Integer durationMins;
    }

    // ── @AuraEnabled methods ──────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static AppointmentDetail getAppointmentDetail(Id appointmentId) {
        maica_cc__Appointment__c appt = [
            SELECT Id,
                   maica_cc__Status__c,
                   maica_cc__Participants__c,
                   maica_cc__Scheduled_Start__c,
                   maica_cc__Scheduled_End__c,
                   maica_cc__Actual_Start__c,
                   maica_cc__Actual_End__c,
                   maica_cc__Check_in__c,
                   maica_cc__Check_out__c
            FROM maica_cc__Appointment__c
            WHERE Id = :appointmentId
            LIMIT 1
        ];

        AppointmentDetail detail = new AppointmentDetail();
        detail.appointmentId = appt.Id;
        detail.status = appt.maica_cc__Status__c;
        detail.participantName = appt.maica_cc__Participants__c;
        detail.scheduledStart = appt.maica_cc__Scheduled_Start__c != null
            ? appt.maica_cc__Scheduled_Start__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
        detail.scheduledEnd = appt.maica_cc__Scheduled_End__c != null
            ? appt.maica_cc__Scheduled_End__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
        detail.actualStart = appt.maica_cc__Actual_Start__c != null
            ? appt.maica_cc__Actual_Start__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
        detail.actualEnd = appt.maica_cc__Actual_End__c != null
            ? appt.maica_cc__Actual_End__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
        detail.checkIn = appt.maica_cc__Check_in__c != null
            ? appt.maica_cc__Check_in__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
        detail.checkOut = appt.maica_cc__Check_out__c != null
            ? appt.maica_cc__Check_out__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
        return detail;
    }

    @AuraEnabled(cacheable=true)
    public static List<AppointmentResourceDetail> getAppointmentResources(Id appointmentId) {
        List<maica_cc__Appointment_Resource__c> apptResources = [
            SELECT Id,
                   maica_cc__Resource__c,
                   maica_cc__Resource__r.Name,
                   maica_cc__Check_In_Time__c,
                   maica_cc__Check_Out_Time__c,
                   maica_cc__Actual_Start__c,
                   maica_cc__Actual_End__c,
                   Award__c,
                   Award__r.Award_Code__c,
                   Award__r.Employment_Type__c,
                   Award__r.Classification__c,
                   Award__r.Classification_Level__c,
                   Award__r.Casual_Loading_Percent__c,
                   Award__r.Ordinary_Hourly_Rate__c
            FROM maica_cc__Appointment_Resource__c
            WHERE maica_cc__Appointment__c = :appointmentId
        ];

        List<AppointmentResourceDetail> results = new List<AppointmentResourceDetail>();
        for (maica_cc__Appointment_Resource__c ar : apptResources) {
            AppointmentResourceDetail d = new AppointmentResourceDetail();
            d.resourceId = ar.maica_cc__Resource__c;
            d.resourceName = ar.maica_cc__Resource__r?.Name;
            d.hasAwardConfig = ar.Award__c != null;
            d.awardConfigId = ar.Award__c;

            if (ar.Award__c != null) {
                d.awardCode = ar.Award__r.Award_Code__c;
                d.employmentType = ar.Award__r.Employment_Type__c;
                d.classification = ar.Award__r.Classification__c;
                d.classificationLevel = (Integer) ar.Award__r.Classification_Level__c;
                d.casualLoadingPercent = ar.Award__r.Casual_Loading_Percent__c ?? 0;
                d.ordinaryHourlyRate = ar.Award__r.Ordinary_Hourly_Rate__c;
            }

            d.checkInTime = ar.maica_cc__Check_In_Time__c != null
                ? ar.maica_cc__Check_In_Time__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
            d.checkOutTime = ar.maica_cc__Check_Out_Time__c != null
                ? ar.maica_cc__Check_Out_Time__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
            d.actualStart = ar.maica_cc__Actual_Start__c != null
                ? ar.maica_cc__Actual_Start__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
            d.actualEnd = ar.maica_cc__Actual_End__c != null
                ? ar.maica_cc__Actual_End__c.format('yyyy-MM-dd\'T\'HH:mm:ss', 'Australia/Sydney') : null;
            results.add(d);
        }
        return results;
    }

    @AuraEnabled
    public static AppointmentCostResult calculateCost(
        Id appointmentId,
        String dateSetType,          // 'scheduled' | 'actual' | 'checkinout'
        String startOverride,        // ISO string override (null = use dateSetType default)
        String endOverride
    ) {
        Award_Interpreter_Settings__mdt s = getSettings();

        // Build resource payload from Appointment Resources + their Award Configs
        List<AppointmentResourceDetail> resources = getAppointmentResources(appointmentId);
        AppointmentDetail appt = getAppointmentDetail(appointmentId);

        List<Map<String, Object>> resourcePayload = new List<Map<String, Object>>();
        for (AppointmentResourceDetail r : resources) {
            if (!r.hasAwardConfig) continue;  // skip resources without an award config

            String shiftStart = resolveDateTime(dateSetType, 'start', appt, r, startOverride);
            String shiftEnd   = resolveDateTime(dateSetType, 'end',   appt, r, endOverride);
            if (shiftStart == null || shiftEnd == null) continue;

            Map<String, Object> entry = new Map<String, Object>{
                'resource_id'            => r.resourceId,
                'resource_name'          => r.resourceName ?? 'Unknown',
                'award_code'             => r.awardCode,
                'employment_type'        => r.employmentType,
                'classification'         => r.classification ?? '',
                'classification_level'   => r.classificationLevel ?? 1,
                'casual_loading_percent' => r.casualLoadingPercent ?? 0,
                'ordinary_hourly_rate'   => r.ordinaryHourlyRate,
                'shift_start'            => shiftStart,
                'shift_end'              => shiftEnd
            };
            resourcePayload.add(entry);
        }

        Map<String, Object> body = new Map<String, Object>{
            'appointment_id' => (String) appointmentId,
            'resources'      => resourcePayload
        };

        HttpRequest req = new HttpRequest();
        req.setEndpoint(s.API_Base_URL__c + '/api/v1/appointment-cost');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-Org-ID', s.Org_ID__c);
        req.setHeader('X-API-Key', s.API_Key__c);
        req.setBody(JSON.serialize(body));
        req.setTimeout(15000);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException(
                'API error calculating appointment cost: ' + res.getStatusCode() + ' ' + res.getBody()
            );
        }

        return parseApiResponse(res.getBody());
    }

    private static final String UNAVAIL_TYPE_APPOINTMENT_BREAK = 'Appointment Break';

    @AuraEnabled
    public static List<ExistingBreakInfo> getExistingBreaks(Id appointmentId) {
        List<maica_cc__Unavailability__c> breaks = [
            SELECT maica_cc__Resource__c, maica_cc__Duration_mins__c
            FROM maica_cc__Unavailability__c
            WHERE maica_cc__Appointment__c = :appointmentId
            AND maica_cc__Type__c = :UNAVAIL_TYPE_APPOINTMENT_BREAK
        ];
        List<ExistingBreakInfo> results = new List<ExistingBreakInfo>();
        for (maica_cc__Unavailability__c b : breaks) {
            ExistingBreakInfo info = new ExistingBreakInfo();
            info.resourceId = b.maica_cc__Resource__c;
            info.durationMins = b.maica_cc__Duration_mins__c != null ? b.maica_cc__Duration_mins__c.intValue() : 0;
            results.add(info);
        }
        return results;
    }

    @AuraEnabled
    public static void createBreaks(Id appointmentId, List<BreakRequest> requests) {
        if (requests == null || requests.isEmpty()) return;

        List<maica_cc__Unavailability__c> toInsert = new List<maica_cc__Unavailability__c>();
        for (BreakRequest req : requests) {
            String fromStr = req.breakStartIso.replace('T', ' ');
            String toStr   = req.breakEndIso.replace('T', ' ');
            if (fromStr.contains('.')) fromStr = fromStr.substringBefore('.');
            if (toStr.contains('.'))   toStr   = toStr.substringBefore('.');
            if (fromStr.length() > 19) fromStr = fromStr.substring(0, 19);
            if (toStr.length() > 19)   toStr   = toStr.substring(0, 19);
            Datetime fromDt = Datetime.valueOf(fromStr);
            Datetime toDt   = Datetime.valueOf(toStr);

            maica_cc__Unavailability__c u = new maica_cc__Unavailability__c();
            u.maica_cc__Appointment__c    = appointmentId;
            u.maica_cc__Resource__c       = req.resourceId;
            u.maica_cc__Type__c           = UNAVAIL_TYPE_APPOINTMENT_BREAK;
            u.maica_cc__Status__c         = 'Approved';
            u.maica_cc__Billable__c       = false;
            u.maica_cc__Unavailable_From__c = fromDt;
            u.maica_cc__Unavailable_To__c   = toDt;
            // Duration__c and Duration_mins__c are formula fields, calculated from From/To
            toInsert.add(u);
        }
        insert toInsert;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static String resolveDateTime(
        String dateSetType,
        String startOrEnd,
        AppointmentDetail appt,
        AppointmentResourceDetail resource,
        String dtOverride
    ) {
        if (dtOverride != null) return dtOverride;

        if (dateSetType == 'scheduled') {
            return startOrEnd == 'start' ? appt.scheduledStart : appt.scheduledEnd;
        } else if (dateSetType == 'actual') {
            // Prefer resource-level actual; fall back to appointment-level
            if (startOrEnd == 'start') {
                return resource.actualStart != null ? resource.actualStart : appt.actualStart;
            } else {
                return resource.actualEnd != null ? resource.actualEnd : appt.actualEnd;
            }
        } else {  // 'checkinout'
            return startOrEnd == 'start' ? resource.checkInTime : resource.checkOutTime;
        }
    }

    private static AppointmentCostResult parseApiResponse(String body) {
        Map<String, Object> raw = (Map<String, Object>) JSON.deserializeUntyped(body);

        AppointmentCostResult result = new AppointmentCostResult();
        result.appointmentId = (String) raw.get('appointment_id');
        result.totalCost     = (Decimal) raw.get('total_cost');
        result.totalHours    = (Decimal) raw.get('total_hours');
        result.warnings      = new List<String>();
        result.resources     = new List<ResourceCostResult>();

        List<Object> rawWarnings = (List<Object>) raw.get('warnings');
        if (rawWarnings != null) {
            for (Object w : rawWarnings) result.warnings.add((String) w);
        }

        List<Object> rawResources = (List<Object>) raw.get('resources');
        if (rawResources != null) {
            for (Object o : rawResources) {
                Map<String, Object> rMap = (Map<String, Object>) o;
                ResourceCostResult r = new ResourceCostResult();
                r.resourceId         = (String) rMap.get('resource_id');
                r.resourceName       = (String) rMap.get('resource_name');
                r.awardCode          = (String) rMap.get('award_code');
                r.employmentType     = (String) rMap.get('employment_type');
                r.classification     = (String) rMap.get('classification');
                r.classificationLevel = rMap.get('classification_level') != null
                    ? Integer.valueOf(String.valueOf(rMap.get('classification_level'))) : null;
                r.ordinaryHourlyRate = rMap.get('ordinary_hourly_rate') != null
                    ? Decimal.valueOf(String.valueOf(rMap.get('ordinary_hourly_rate'))) : 0;
                r.paidHours          = rMap.get('paid_hours') != null
                    ? Decimal.valueOf(String.valueOf(rMap.get('paid_hours'))) : 0;
                r.grossPay           = rMap.get('gross_pay') != null
                    ? Decimal.valueOf(String.valueOf(rMap.get('gross_pay'))) : 0;
                r.dayType            = (String) rMap.get('day_type');
                r.error              = (String) rMap.get('error');
                r.warnings           = new List<String>();
                r.segments           = new List<CostSegment>();

                List<Object> rWarnings = (List<Object>) rMap.get('warnings');
                if (rWarnings != null) {
                    for (Object w : rWarnings) r.warnings.add((String) w);
                }

                List<Object> rawSegs = (List<Object>) rMap.get('segments');
                if (rawSegs != null) {
                    for (Object seg : rawSegs) {
                        Map<String, Object> sMap = (Map<String, Object>) seg;
                        CostSegment cs = new CostSegment();
                        cs.description = (String) sMap.get('description');
                        cs.hours       = Decimal.valueOf(String.valueOf(sMap.get('hours')));
                        cs.rate        = Decimal.valueOf(String.valueOf(sMap.get('rate')));
                        cs.cost        = Decimal.valueOf(String.valueOf(sMap.get('cost')));
                        cs.penaltyKey  = (String) sMap.get('penalty_key');
                        r.segments.add(cs);
                    }
                }
                result.resources.add(r);
            }
        }
        return result;
    }
}
