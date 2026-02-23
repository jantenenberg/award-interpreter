# Salesforce Award Custom Object

This directory contains Salesforce metadata for the **Award** custom object, designed to store all 155 records from `map-award-export-2025.xlsx`.

## Object Structure

**Object API Name:** `Award__c`  
**Object Label:** Award  
**Plural Label:** Awards

## Fields

| Field API Name | Field Label | Type | Required | External ID | Description |
|----------------|-------------|------|----------|-------------|-------------|
| `Award_ID__c` | Award ID | Text(255) | Yes | No | GUID from MAP export (e.g. d95171e3-932f-f011-8c4e-00224895df16). Unique. |
| `Award_Fixed_ID__c` | Award Fixed ID | Number(18,0) | Yes | No | Numeric fixed ID (e.g. 1) |
| `Award_Code__c` | Award Code | Text(20) | Yes | Yes | Primary lookup key (e.g. MA000004). Unique, External ID, Track History. |
| `Name__c` | Name | Text(255) | Yes | No | Full award name (e.g. "General Retail Industry Award 2020") |
| `Version_Number__c` | Version Number | Number(18,0) | No | No | Version number (e.g. 3) |
| `Award_Operative_From__c` | Award Operative From | Date | No | No | ISO date when award becomes operative (may be null) |
| `Award_Operative_To__c` | Award Operative To | Date | No | No | ISO date when award expires (frequently null = currently operative) |
| `Last_Modified_DateTime__c` | Last Modified Date Time | DateTime | No | No | ISO datetime of last modification (may be null) |

**Note:** Salesforce automatically creates `Name` field (standard name field). The `Award_Code__c` field is marked as External ID and Unique, making it the primary lookup key for integrations and data imports.

## Deployment

### Using Salesforce CLI (sfdx)

1. **Deploy the object and fields:**
   ```bash
   sfdx force:source:deploy -p salesforce/force-app/main/default/objects/Award__c
   ```

2. **Verify deployment:**
   ```bash
   sfdx force:source:status
   ```

### Using VS Code with Salesforce Extensions

1. Right-click `salesforce/force-app/main/default/objects/Award__c` folder
2. Select "SFDX: Deploy Source to Org"

### Manual Setup (Setup UI)

1. Setup → Object Manager → Create → Custom Object
2. Object Label: "Award", Plural Label: "Awards"
3. Record Name: "Award Code", Data Type: Text
4. Add each field from the fields directory

## Data Import

After deploying the object, import the 155 records from `map-award-export-2025.xlsx`:

### Option 1: Data Import Wizard
1. Setup → Data Import Wizard
2. Select "Award" object
3. Map Excel columns to Salesforce fields:
   - `awardID` → `Award_ID__c`
   - `awardFixedID` → `Award_Fixed_ID__c`
   - `awardCode` → `Award_Code__c` (External ID)
   - `name` → `Name__c`
   - `versionNumber` → `Version_Number__c`
   - `awardOperativeFrom` → `Award_Operative_From__c`
   - `awardOperativeTo` → `Award_Operative_To__c`
   - `lastModifiedDateTime` → `Last_Modified_DateTime__c`

### Option 2: Data Loader
1. Export Excel to CSV (ensure dates are ISO format: YYYY-MM-DD)
2. Use Data Loader to insert/upsert records
3. Use `Award_Code__c` as the External ID for upserts

### Option 3: Apex/Integration Code
Use the `loadAwards()` function from `src/lib/award-loader.js` (or port to Apex) to parse Excel and insert via DML or REST API.

## SOQL Examples

```sql
-- Get all active awards as of today
SELECT Award_Code__c, Name__c, Award_Operative_From__c, Award_Operative_To__c
FROM Award__c
WHERE (Award_Operative_From__c <= TODAY OR Award_Operative_From__c = null)
  AND (Award_Operative_To__c >= TODAY OR Award_Operative_To__c = null)

-- Lookup by Award Code (primary key)
SELECT Id, Award_Code__c, Name__c
FROM Award__c
WHERE Award_Code__c = 'MA000004'

-- Get awards operative on a specific date
SELECT Award_Code__c, Name__c
FROM Award__c
WHERE Award_Operative_From__c <= 2025-07-15
  AND (Award_Operative_To__c >= 2025-07-15 OR Award_Operative_To__c = null)
```

## Integration with Award Interpreter Engine

When migrating the calculation engine to Salesforce:

1. **Replace CSV loading** with SOQL queries on `Award__c`
2. **Use `Award_Code__c`** as the lookup key (replaces `awardsByCode` Map)
3. **Filter by operative dates** using SOQL WHERE clause (replaces `getActiveAwards` function)
4. **Apex example:**
   ```apex
   Map<String, Award__c> awardsByCode = new Map<String, Award__c>();
   for (Award__c award : [
       SELECT Award_Code__c, Name__c, Award_Operative_From__c, Award_Operative_To__c
       FROM Award__c
       WHERE (Award_Operative_From__c <= TODAY OR Award_Operative_From__c = null)
         AND (Award_Operative_To__c >= TODAY OR Award_Operative_To__c = null)
   ]) {
       awardsByCode.put(award.Award_Code__c, award);
   }
   ```

## Field Mappings Reference

| Excel Column | Salesforce Field API Name | Notes |
|--------------|---------------------------|-------|
| awardID | Award_ID__c | GUID, unique |
| awardFixedID | Award_Fixed_ID__c | Number |
| awardCode | Award_Code__c | External ID, unique, primary key |
| name | Name__c | Text, trimmed |
| versionNumber | Version_Number__c | Number, nullable |
| awardOperativeFrom | Award_Operative_From__c | Date, nullable |
| awardOperativeTo | Award_Operative_To__c | Date, nullable (null = currently operative) |
| lastModifiedDateTime | Last_Modified_DateTime__c | DateTime, nullable |
