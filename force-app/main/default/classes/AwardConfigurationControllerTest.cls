@isTest
private class AwardConfigurationControllerTest {

    @testSetup
    static void setup() {
        // Resource__c is optional; tests focus on award configuration logic.
        Award_Configuration__c config = new Award_Configuration__c(
            Configured__c = false
        );
        insert config;
    }

    @isTest
    static void testGetCurrentConfiguration() {
        Award_Configuration__c config = [SELECT Id FROM Award_Configuration__c LIMIT 1];
        Test.startTest();
        Award_Configuration__c result =
            AwardConfigurationController.getCurrentConfiguration(config.Id);
        Test.stopTest();
        System.assertNotEquals(null, result);
        System.assertEquals(false, result.Configured__c);
    }

    @isTest
    static void testSaveConfiguration() {
        Award_Configuration__c config = [SELECT Id FROM Award_Configuration__c LIMIT 1];
        Test.startTest();
        Boolean isPrimary = AwardConfigurationController.saveConfiguration(
            config.Id,
            'MA000004',
            'General Retail Industry Award 2020',
            'CA',
            'Retail Employee Level 1',
            1,
            25.0,
            Date.today(),
            33.19
        );
        Test.stopTest();

        Award_Configuration__c updated = [
            SELECT Award_Code__c, Employment_Type__c, Is_Active__c, Configured__c, Is_Primary__c
            FROM Award_Configuration__c
            WHERE Id = :config.Id
        ];
        System.assertEquals('MA000004', updated.Award_Code__c);
        System.assertEquals('CA', updated.Employment_Type__c);
        System.assertEquals(true, updated.Is_Active__c);
        System.assertEquals(true, updated.Configured__c);
        // First/only config with no resource — should be auto-set as primary
        System.assertEquals(true, updated.Is_Primary__c);
        System.assertEquals(true, isPrimary);
    }

    @isTest
    static void testDeactivatesOtherConfigsOnSave() {
        Award_Configuration__c other = new Award_Configuration__c(
            Award_Code__c = 'MA000004',
            Is_Active__c = true,
            Configured__c = true
        );
        insert other;

        Award_Configuration__c config = [
            SELECT Id FROM Award_Configuration__c WHERE Configured__c = false LIMIT 1
        ];

        Test.startTest();
        AwardConfigurationController.saveConfiguration(
            config.Id, 'MA000004', 'Test Award', 'FT',
            'Retail Employee Level 2', 2, null, Date.today(), 28.00
        );
        Test.stopTest();

        Award_Configuration__c deactivated = [
            SELECT Is_Active__c FROM Award_Configuration__c WHERE Id = :other.Id
        ];
        System.assertEquals(false, deactivated.Is_Active__c,
            'Previous active config for same award should be deactivated');
    }

    @isTest
    static void testSetAsPrimary() {
        // Insert two configs for the same resource (null resource, isolated test)
        Award_Configuration__c first = new Award_Configuration__c(
            Award_Code__c = 'MA000004',
            Is_Primary__c = true,
            Configured__c = true
        );
        insert first;

        Award_Configuration__c second = new Award_Configuration__c(
            Award_Code__c = 'MA000009',
            Is_Primary__c = false,
            Configured__c = true
        );
        insert second;

        // setAsPrimary on second; since Resource__c is null for both,
        // siblings query returns nothing — second is just set to primary.
        Test.startTest();
        AwardConfigurationController.setAsPrimary(second.Id);
        Test.stopTest();

        Award_Configuration__c updated = [
            SELECT Is_Primary__c FROM Award_Configuration__c WHERE Id = :second.Id
        ];
        System.assertEquals(true, updated.Is_Primary__c,
            'Target config should be set as primary');
    }
}
