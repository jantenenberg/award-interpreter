public with sharing class AwardConfigurationController {

    private static final String SETTINGS_RECORD = 'Default';

    private static Award_Interpreter_Settings__mdt getSettings() {
        return [
            SELECT Org_ID__c, API_Key__c, API_Base_URL__c
            FROM Award_Interpreter_Settings__mdt
            WHERE DeveloperName = :SETTINGS_RECORD
            LIMIT 1
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<AwardOption> getAwards() {
        Award_Interpreter_Settings__mdt s = getSettings();
        HttpRequest req = new HttpRequest();
        req.setEndpoint(s.API_Base_URL__c + '/api/v1/awards');
        req.setMethod('GET');
        req.setHeader('X-Org-ID', s.Org_ID__c);
        req.setHeader('X-API-Key', s.API_Key__c);
        req.setTimeout(10000);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException(
                'API error fetching awards: ' + res.getStatusCode()
            );
        }

        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        List<Object> rawAwards = (List<Object>) body.get('awards');
        List<AwardOption> awards = new List<AwardOption>();
        for (Object a : rawAwards) {
            Map<String, Object> award = (Map<String, Object>) a;
            awards.add(new AwardOption(
                (String) award.get('award_code'),
                (String) award.get('award_title')
            ));
        }
        return awards;
    }

    @AuraEnabled(cacheable=true)
    public static List<ClassificationOption> getClassifications(
        String awardCode,
        String employmentType
    ) {
        Award_Interpreter_Settings__mdt s = getSettings();
        HttpRequest req = new HttpRequest();
        req.setEndpoint(
            s.API_Base_URL__c +
            '/api/v1/classifications/' +
            EncodingUtil.urlEncode(awardCode, 'UTF-8') +
            '?employment_type=' +
            EncodingUtil.urlEncode(employmentType, 'UTF-8')
        );
        req.setMethod('GET');
        req.setHeader('X-Org-ID', s.Org_ID__c);
        req.setHeader('X-API-Key', s.API_Key__c);
        req.setTimeout(10000);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException(
                'API error fetching classifications: ' + res.getStatusCode()
            );
        }

        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        List<Object> rawList = (List<Object>) body.get('classifications');
        List<ClassificationOption> results = new List<ClassificationOption>();
        for (Object c : rawList) {
            Map<String, Object> cl = (Map<String, Object>) c;
            results.add(new ClassificationOption(
                (String) cl.get('classification'),
                (Integer) cl.get('classification_level'),
                cl.get('base_rate') != null ? String.valueOf(cl.get('base_rate')) : null
            ));
        }
        return results;
    }

    @AuraEnabled
    public static void saveConfiguration(
        Id configId,
        String awardCode,
        String awardName,
        String employmentType,
        String classification,
        Integer classificationLevel,
        Decimal casualLoadingPercent,
        Date effectiveDate,
        Decimal ordinaryHourlyRate
    ) {
        // Read current record to get Resource__c
        Award_Configuration__c config = [
            SELECT Id, Resource__c
            FROM Award_Configuration__c
            WHERE Id = :configId
            LIMIT 1
        ];

        // Deactivate any other active configs for this resource + award combination
        List<Award_Configuration__c> others = [
            SELECT Id
            FROM Award_Configuration__c
            WHERE Resource__c = :config.Resource__c
            AND Award_Code__c = :awardCode
            AND Is_Active__c = true
            AND Id != :configId
        ];
        for (Award_Configuration__c other : others) {
            other.Is_Active__c = false;
        }
        if (!others.isEmpty()) update others;

        // Update the current record
        config.Award_Code__c = awardCode;
        config.Award_Name__c = awardName;
        config.Employment_Type__c = employmentType;
        config.Classification__c = classification;
        config.Classification_Level__c = classificationLevel;
        config.Casual_Loading_Percent__c = casualLoadingPercent;
        config.Effective_Date__c = effectiveDate;
        config.Ordinary_Hourly_Rate__c = ordinaryHourlyRate;
        config.Is_Active__c = true;
        config.Configured__c = true;
        update config;
    }

    @AuraEnabled(cacheable=true)
    public static Award_Configuration__c getCurrentConfiguration(Id configId) {
        return [
            SELECT Id, Award_Code__c, Award_Name__c, Employment_Type__c,
                   Classification__c, Classification_Level__c,
                   Casual_Loading_Percent__c, Effective_Date__c,
                   Ordinary_Hourly_Rate__c, Is_Active__c, Configured__c,
                   Resource__c, Resource__r.Name
            FROM Award_Configuration__c
            WHERE Id = :configId
            LIMIT 1
        ];
    }

    // ── Inner classes ────────────────────────────────────────────────────────

    public class AwardOption {
        @AuraEnabled public String awardCode;
        @AuraEnabled public String awardTitle;
        public AwardOption(String code, String title) {
            this.awardCode = code;
            this.awardTitle = title;
        }
    }

    public class ClassificationOption {
        @AuraEnabled public String classification;
        @AuraEnabled public Integer classificationLevel;
        @AuraEnabled public String baseRate;
        public ClassificationOption(String c, Integer l, String r) {
            this.classification = c;
            this.classificationLevel = l;
            this.baseRate = r;
        }
    }
}
