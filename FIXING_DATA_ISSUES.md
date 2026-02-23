# Fixing Data Issues in Award Interpreter

## Quick Fix Guide

If you're seeing warnings about incorrect Sunday or Saturday rates, follow these steps:

### Method 1: Auto-Fix (Recommended)

1. **Open the Configuration page**: Navigate to `config.html` (or click "Configuration" in the navigation)

2. **Click "Scan for Issues"**: This will detect all data validation problems

3. **Click "Fix"** on any Sunday rate warnings:
   - This automatically sets the Sunday rate to the correct ×1.50 multiplier
   - Example: If base rate is $26.55/hr, Sunday rate will be set to $39.83/hr

4. **Click "Fix"** on any Saturday rate warnings:
   - This automatically sets Saturday to use a flat ×1.25 rate
   - Example: If base rate is $26.55/hr, Saturday rate will be set to $33.19/hr
   - Also removes incorrect tiered Saturday rates

5. **Reload the main calculator page** to see the changes

### Method 2: Manual Override

If auto-fix doesn't work, manually override rates:

#### Fix Sunday Rate

1. Go to **Section 2.2: Penalty Rate Mappings**
2. Select:
   - **Award**: MA000004 (or your award code)
   - **Classification**: Retail Employee Level 1 (or your classification)
   - **Penalty description**: `Sunday` or `Sunday - ordinary hours`
   - **Rate**: Calculate as `baseRate × 1.50`
     - Example: $26.55 × 1.50 = **$39.83**
3. Click **"Add Override"**

#### Fix Saturday Rate (Flat Rate)

1. Go to **Section 2.2: Penalty Rate Mappings**
2. Select:
   - **Award**: MA000004
   - **Classification**: Retail Employee Level 1
   - **Penalty description**: `Saturday - ordinary hours`
   - **Rate**: Calculate as `baseRate × 1.25`
     - Example: $26.55 × 1.25 = **$33.19**
3. Click **"Add Override"**

#### Remove Incorrect Tiered Saturday Rates

If Saturday is showing tiered rates ($39.83 and $53.10) but should be flat:

1. The auto-fix will remove these automatically
2. Or manually check the **Penalty Rate Mappings** table and remove any entries for:
   - "Saturday - first 3 hours"
   - "Saturday - after 3 hours"

### Common Rate Calculations

For **MA000004 Casual Level 1** with base rate **$26.55/hr**:

- **Sunday**: $26.55 × 1.50 = **$39.83/hr**
- **Saturday (flat)**: $26.55 × 1.25 = **$33.19/hr**
- **Public holiday**: Check your award, typically ×2.00 = **$53.10/hr**

### Verifying Fixes

After applying fixes:

1. Go back to the main calculator page
2. Run a calculation for the affected shifts
3. Check that:
   - Sunday shifts use $39.83/hr (not $53.10/hr)
   - Saturday shifts use $33.19/hr flat rate (not tiered rates)
   - Warnings should disappear

### Exporting Configuration

To save your fixes:

1. Go to **Section 6: Export/Import Configuration**
2. Click **"Export Configuration"**
3. Save the JSON file as a backup

### Need Help?

- Check the **Documentation** page for detailed calculation logic
- Review the **Data Issues** section in Configuration for specific warnings
- All overrides are stored in browser localStorage and persist across sessions