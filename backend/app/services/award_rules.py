"""
Fallback constants used only when database is unavailable.
In normal operation all rates come from the database.
"""

AWARD_CODE = "MA000004"
RATES_VERSION = "2024-07-01"

# Last-resort fallback if DATABASE_URL is not set
BASE_WEEKLY_RATE = 1008.90
STANDARD_HOURS = 38
DEFAULT_CASUAL_LOADING = 0.25

# Minimum engagement for casual employees (hours)
MINIMUM_ENGAGEMENT_HOURS = 3

# Time of day boundaries
EARLY_BOUNDARY = 7
LATE_BOUNDARY = 18

# Ordinary hours threshold before overtime kicks in
ORDINARY_HOURS_THRESHOLD = 9

# Penalty multipliers — used in rates.py endpoint and tests
PENALTY_MULTIPLIERS = {
    "ordinary": 1.00,
    "weekday_early_late": 1.10,
    "friday_late": 1.15,
    "saturday": 1.25,
    "saturday_ordinary": 1.25,
    "sunday": 1.50,
    "publicholiday": 2.25,
}

# Overtime multipliers
OVERTIME_MULTIPLIERS = {
    "first_3_hours": 1.50,
    "beyond_3_hours": 2.00,
}


def get_ordinary_hourly_rate(base_weekly_rate: float, casual_loading_percent: float) -> float:
    import math
    loading = 1 + (casual_loading_percent / 100)
    value = (base_weekly_rate / STANDARD_HOURS) * loading
    exp = 10 ** 2
    return math.floor(value * exp + 0.5) / exp
