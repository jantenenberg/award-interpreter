# Award Interpreter — Test Scenarios & Documentation Verification
*Last updated: February 2026*
*All scenarios verified against documentation.html*

---

## Task 1 — Documentation Fix

In **Section 4.2** (Penalty Rate Mapping table), add the following note immediately after the closing `</table>` tag:

> *Note: `saturday_first_3` and `saturday_after_3` are valid internal keys used by other awards with legitimate tiered Saturday structures. For MA000004 CA Level 1 specifically, these keys are always discarded and the flat Saturday rate (×1.25) is applied instead — see Section 4.4.*

---

## Task 2 — Full Scenario Test Suite

All tests use **MA000004, Casual (CA), Level 1**. For each test:
1. Run through the actual shift cost engine (not mocked)
2. Assert exact dollar amount to 2 decimal places
3. Assert segment count matches expected breakdown
4. Assert expected warnings are present in the response
5. Log a clear PASS/FAIL with actual vs expected values on failure

---

### Scenario 1 — Weekday Ordinary + Early/Late Split
*(Section 5.0 example)*

| Field | Value |
|---|---|
| Day | Thursday |
| Shift | 5:00pm – 9:00pm (4 hrs) |
| Break | None |
| Ordinary rate | $26.55/hr |

**Expected breakdown:**
| Segment | Hours | Rate | Cost |
|---|---|---|---|
| Ordinary (5pm–6pm) | 1.0 | $26.55 | $26.55 |
| Weekday early/late (6pm–9pm) | 3.0 | $29.21 | $87.63 |
| **Total** | **4.0** | | **$114.18** |

---

### Scenario 2 — Weekday Overtime
*(Section 5.1 example)*

| Field | Value |
|---|---|
| Day | Monday |
| Shift | 10:00am – 10:00pm (12 hrs) |
| Break | None |
| Ordinary rate | $26.55/hr |

**Expected breakdown:**
| Segment | Hours | Rate | Cost |
|---|---|---|---|
| Ordinary (10am–6pm) | 8.0 | $26.55 | $212.40 |
| Weekday early/late (6pm–7pm) | 1.0 | $29.21 | $29.21 |
| Early/late + overtime ×1.50 (7pm–10pm) | 3.0 | $43.81 | $131.43 |
| **Total** | **12.0** | | **$373.04** |

**Rate verification:** $26.55 × 1.10 (late) × 1.50 (overtime) = $43.81/hr

---

### Scenario 3 — Saturday Flat Rate with Break
*(Section 5.3 example)*

| Field | Value |
|---|---|
| Day | Saturday |
| Shift | 09:00 – 14:00 (5 hrs) |
| Break | 30 min |
| Paid hours | 4.5 |

**Expected breakdown:**
| Segment | Hours | Rate | Cost |
|---|---|---|---|
| Saturday flat rate | 4.5 | $33.19 | $149.36 |
| **Total** | **4.5** | | **$149.36** |

**Assertions:**
- Exactly **1 segment** returned (no tiered Saturday logic)
- No `saturday_first_3` or `saturday_after_3` segments present

---

### Scenario 4 — Saturday Flat Rate No Break
*(Section 7 roster example)*

| Field | Value |
|---|---|
| Day | Saturday |
| Shift | 5 hrs |
| Break | None |

**Expected breakdown:**
| Segment | Hours | Rate | Cost |
|---|---|---|---|
| Saturday flat rate | 5.0 | $33.19 | $165.94 |
| **Total** | **5.0** | | **$165.94** |

---

### Scenario 5 — Wednesday Ordinary
*(Section 7 roster example)*

| Field | Value |
|---|---|
| Day | Wednesday |
| Shift | 9:00am – 2:00pm (5 hrs) |
| Break | None |

**Expected breakdown:**
| Segment | Hours | Rate | Cost |
|---|---|---|---|
| Ordinary | 5.0 | $26.55 | $132.75 |
| **Total** | **5.0** | | **$132.75** |

---

### Scenario 6 — Roster Total
*(Section 7)*

| Shift | Cost |
|---|---|
| Wednesday 5 hrs (Scenario 5) | $132.75 |
| Saturday 5 hrs (Scenario 4) | $165.94 |
| **Roster total (10 hrs)** | **$298.69** |

---

### Scenario 7 — Sunday Minimum Engagement
*(Section 5.2 example)*

| Field | Value |
|---|---|
| Day | Sunday |
| Actual hours worked | 2 hrs |
| Minimum engagement | 3 hrs |
| Padding | 1 hr at Sunday rate |

**Expected breakdown:**
| Segment | Hours | Rate | Cost |
|---|---|---|---|
| Sunday (padded to minimum) | 3.0 | $39.83 | $119.49 |
| **Total** | **3.0** | | **$119.49** |

**Assertions:**
- Warning present: `"Minimum casual engagement of 3 hours applied"`

---

### Scenario 8 — Saturday Minimum Engagement
*(Section 5.2 example)*

| Field | Value |
|---|---|
| Day | Saturday |
| Actual hours worked | 2 hrs |
| Minimum engagement | 3 hrs |
| Padding | 1 hr at flat Saturday rate |

**Expected breakdown:**
| Segment | Hours | Rate | Cost |
|---|---|---|---|
| Saturday flat (padded to minimum) | 3.0 | $33.19 | $99.57 |
| **Total** | **3.0** | | **$99.57** |

**Assertions:**
- Warning present: `"Minimum casual engagement of 3 hours applied"`

---

### Scenario 9 — Casual Loading 25% Rate Derivation
*(Section 4.1 example)*

| Field | Value |
|---|---|
| baseRate | $1,008.90/week |
| casualLoadingPercent | 25 |

**Expected:** (1008.90 ÷ 38) × 1.25 = **$33.19/hr**

---

### Scenario 10 — Casual Loading 0% Rate Derivation
*(Section 4.1 example)*

| Field | Value |
|---|---|
| baseRate | $1,008.90/week |
| casualLoadingPercent | 0 |

**Expected:** (1008.90 ÷ 38) × 1.00 = **$26.55/hr**

**Assertion:** 0% must be respected — must NOT default to 25%

---

### Scenario 11 — Sunday Rate Override (Loading Active)
*(Section 4.5)*

| Field | Value |
|---|---|
| Ordinary rate | $33.19/hr (25% loading applied) |
| Expected Sunday rate | $33.19 × 1.50 = **$49.79/hr** |

**Assertions:**
- System overrides CSV Sunday `penaltyCalculatedValue`
- Uses calculated rate $49.79/hr when "use loading for rate" is active

---

### Scenario 12 — Public Holiday Rate Validation
*(Section 4.3.1)*

| Field | Value |
|---|---|
| Ordinary rate | $33.19/hr (25% loading applied) |
| Expected public holiday rate | $33.19 × 2.25 = **$74.68/hr** |

**Assertions:**
- If CSV `penaltyCalculatedValue` differs, multiplier validation layer overrides it
- DATA QUALITY WARNING generated in response when override is applied

---

## Rate Reference Table
*MA000004, CA, Level 1 — all rates after validation layer*

| Day / Scenario | Multiplier | Rate (26.55 base) | Rate (33.19 loaded) |
|---|---|---|---|
| Weekday ordinary (7am–6pm) | ×1.00 | $26.55 | $33.19 |
| Weekday early/late | ×1.10 | $29.21 | $36.51 |
| Friday after 6pm | ×1.15 | $30.53 | $38.17 |
| Saturday (flat, all hours) | ×1.25 | $33.19 | $41.49 |
| Sunday | ×1.50 | $39.83 | $49.79 |
| Public holiday | ×2.25 | $59.74 | $74.68 |
| Overtime first 3 hrs | ×1.50 on active rate | varies | varies |
| Overtime beyond 3 hrs | ×2.00 on active rate | varies | varies |

---

## Test File Header Comment

Add to top of `tests/shift-cost-bugs.test.js` after all tests pass:

```js
// All scenarios verified against documentation.html — February 2026
```

---

*Award Interpreter — documentation.html, February 2026*
