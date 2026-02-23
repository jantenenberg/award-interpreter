# MA000004 — General Retail Industry Award 2020
# Effective: 2024-07-01
# All rates for Casual (CA) Adult employees

AWARD_CODE = "MA000004"
RATES_VERSION = "2024-07-01"

# Base weekly rate for Level 1
BASE_WEEKLY_RATE = 1008.90
STANDARD_HOURS = 38

# Default casual loading
DEFAULT_CASUAL_LOADING = 0.25

# Penalty multipliers — validated against Fair Work documentation
PENALTY_MULTIPLIERS = {
    "ordinary": 1.00,
    "weekday_early_late": 1.10,
    "friday_late": 1.15,
    "saturday": 1.25,
    "saturday_ordinary": 1.25,
    "sunday": 1.50,
    "publicholiday": 2.25,
}

# Overtime multipliers (applied on top of time-of-day penalty)
OVERTIME_MULTIPLIERS = {
    "first_3_hours": 1.50,
    "beyond_3_hours": 2.00,
}

# Ordinary hours threshold before overtime kicks in
ORDINARY_HOURS_THRESHOLD = 9

# Minimum engagement for casual employees (hours)
MINIMUM_ENGAGEMENT_HOURS = 3

# Time of day boundaries
EARLY_BOUNDARY = 7    # Before 7am = early/late penalty
LATE_BOUNDARY = 18    # After 6pm = early/late penalty (after 6pm Fri = friday_late)

# Multiplier validation ranges — used to detect bad CSV data in Phase 2
MULTIPLIER_RANGES = {
    "ordinary":            (0.98, 1.02),
    "weekday_early_late":  (1.08, 1.12),
    "friday_late":         (1.13, 1.17),
    "saturday":            (1.23, 1.27),
    "saturday_ordinary":   (1.23, 1.27),
    "sunday":              (1.48, 1.52),
    "publicholiday":       (2.23, 2.27),
}
