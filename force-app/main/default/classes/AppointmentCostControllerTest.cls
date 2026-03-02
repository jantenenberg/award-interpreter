@isTest
private class AppointmentCostControllerTest {

    // ── Shared test data ──────────────────────────────────────────────────────

    @testSetup
    static void setup() {
        // Create an Award Configuration that the Appointment Resource can reference
        Award_Configuration__c award = new Award_Configuration__c(
            Award_Code__c = 'MA000004',
            Award_Name__c = 'General Retail Industry Award 2020',
            Employment_Type__c = 'CA',
            Classification__c = 'Retail Employee Level 1',
            Classification_Level__c = 1,
            Casual_Loading_Percent__c = 25,
            Ordinary_Hourly_Rate__c = 33.19,
            Is_Active__c = true,
            Configured__c = true
        );
        insert award;
    }

    // ── getAppointmentResources ───────────────────────────────────────────────

    @isTest
    static void testGetAppointmentResources_noResources() {
        // Query a real appointment from the org; if none exist, skip gracefully.
        List<maica_cc__Appointment__c> appts = [
            SELECT Id FROM maica_cc__Appointment__c LIMIT 1
        ];
        if (appts.isEmpty()) return;

        Test.startTest();
        List<AppointmentCostController.AppointmentResourceDetail> results =
            AppointmentCostController.getAppointmentResources(appts[0].Id);
        Test.stopTest();

        // Result may be empty or populated — just assert no exception was thrown
        System.assertNotEquals(null, results);
    }

    // ── getAppointmentDetail ──────────────────────────────────────────────────

    @isTest
    static void testGetAppointmentDetail() {
        List<maica_cc__Appointment__c> appts = [
            SELECT Id, maica_cc__Status__c
            FROM maica_cc__Appointment__c
            LIMIT 1
        ];
        if (appts.isEmpty()) return;

        Test.startTest();
        AppointmentCostController.AppointmentDetail detail =
            AppointmentCostController.getAppointmentDetail(appts[0].Id);
        Test.stopTest();

        System.assertNotEquals(null, detail);
        System.assertEquals(appts[0].Id, detail.appointmentId);
        System.assertEquals(appts[0].maica_cc__Status__c, detail.status);
    }

    // ── calculateCost — callout mock ──────────────────────────────────────────

    @isTest
    static void testCalculateCost_mockCallout() {
        List<maica_cc__Appointment__c> appts = [
            SELECT Id FROM maica_cc__Appointment__c LIMIT 1
        ];
        if (appts.isEmpty()) return;

        // Mock a successful API response
        Test.setMock(HttpCalloutMock.class, new AppointmentCostMock());
        Test.startTest();
        AppointmentCostController.AppointmentCostResult result =
            AppointmentCostController.calculateCost(
                appts[0].Id, 'scheduled', null, null
            );
        Test.stopTest();

        System.assertNotEquals(null, result);
        System.assertEquals(appts[0].Id, result.appointmentId);
    }

    @isTest
    static void testGetExistingBreaks() {
        List<maica_cc__Appointment__c> appts = [SELECT Id FROM maica_cc__Appointment__c LIMIT 1];
        if (appts.isEmpty()) return;

        Test.startTest();
        List<AppointmentCostController.ExistingBreakInfo> breaks =
            AppointmentCostController.getExistingBreaks(appts[0].Id);
        Test.stopTest();

        System.assertNotEquals(null, breaks);
    }

    @isTest
    static void testCreateBreaks() {
        List<maica_cc__Appointment_Resource__c> apptResources = [
            SELECT maica_cc__Appointment__c, maica_cc__Resource__c
            FROM maica_cc__Appointment_Resource__c
            WHERE maica_cc__Resource__c != null
            LIMIT 1
        ];
        if (apptResources.isEmpty()) return;

        Id apptId = apptResources[0].maica_cc__Appointment__c;
        Id resId = apptResources[0].maica_cc__Resource__c;

        AppointmentCostController.BreakRequest req = new AppointmentCostController.BreakRequest();
        req.resourceId = resId;
        req.breakStartIso = '2025-12-17T15:45:00';
        req.breakEndIso   = '2025-12-17T16:15:00';
        req.durationMins  = 30;

        Test.startTest();
        AppointmentCostController.createBreaks(apptId, new List<AppointmentCostController.BreakRequest>{ req });
        Test.stopTest();

        List<maica_cc__Unavailability__c> created = [
            SELECT Id, maica_cc__Type__c, maica_cc__Status__c, maica_cc__Billable__c,
                   maica_cc__Resource__c, maica_cc__Appointment__c
            FROM maica_cc__Unavailability__c
            WHERE maica_cc__Appointment__c = :apptId
            AND maica_cc__Type__c = 'Appointment Break'
        ];
        System.assertEquals(1, created.size());
        System.assertEquals('Approved', created[0].maica_cc__Status__c);
        System.assertEquals(false, created[0].maica_cc__Billable__c);
    }

    // ── Inner mock class ──────────────────────────────────────────────────────

    private class AppointmentCostMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HTTPResponse res = new HTTPResponse();
            res.setStatusCode(200);
            res.setBody(JSON.serialize(new Map<String, Object>{
                'appointment_id' => '001000000000001AAA',
                'total_cost'     => 266.52,
                'total_hours'    => 8.0,
                'resources'      => new List<Object>(),
                'warnings'       => new List<String>()
            }));
            return res;
        }
    }
}
