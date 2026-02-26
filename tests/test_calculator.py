"""
Pytest tests for the Award Interpreter calculator engine.
All scenarios from documentation; assert exact dollar amounts to 2 decimal places.
"""
import math
import pytest
from datetime import date

from app.services.calculator import calculate_shift, get_ordinary_hourly_rate
from app.services.award_rules import BASE_WEEKLY_RATE


def _round_half_up(value: float, decimals: int = 2) -> float:
    exp = 10 ** decimals
    return math.floor(value * exp + 0.5) / exp


# ---- Rate-only checks ----
def test_casual_loading_25_percent():
    """Casual loading 25%: (1008.90÷38)×1.25 = $33.19/hr"""
    rate = get_ordinary_hourly_rate(BASE_WEEKLY_RATE, 25)
    assert rate == 33.19


def test_casual_loading_0_percent():
    """Casual loading 0%: (1008.90÷38)×1.00 = $26.55/hr"""
    rate = get_ordinary_hourly_rate(BASE_WEEKLY_RATE, 0)
    assert rate == 26.55


def test_sunday_rate_with_loading():
    """Sunday rate with loading: $33.19×1.50 = $49.79/hr"""
    ordinary = get_ordinary_hourly_rate(BASE_WEEKLY_RATE, 25)
    sunday_rate = _round_half_up(ordinary * 1.50, 2)
    assert sunday_rate == 49.79


def test_public_holiday_rate():
    """Public holiday rate: $33.19×2.25 = $74.68/hr"""
    ordinary = get_ordinary_hourly_rate(BASE_WEEKLY_RATE, 25)
    ph_rate = round(ordinary * 2.25, 2)
    assert ph_rate == 74.68


# ---- Single-shift scenarios (0% casual for dollar match to spec) ----
def test_wednesday_9am_2pm_5hrs_no_break():
    """Wednesday 9am–2pm 5hrs, no break → $132.75"""
    result = calculate_shift(
        shift_date=date(2025, 1, 8),
        start_time="09:00",
        duration_hours=5.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["gross_pay"] == 132.75
    assert result["paid_hours"] == 5.0
    assert len(result["segments"]) >= 1
    assert result["day_type"] == "weekday"


def test_saturday_9am_2pm_5hrs_no_break():
    """Saturday 9am–2pm 5hrs, no break → $165.94"""
    result = calculate_shift(
        shift_date=date(2025, 1, 11),
        start_time="09:00",
        duration_hours=5.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["gross_pay"] == 165.94
    assert result["paid_hours"] == 5.0
    assert len(result["segments"]) >= 1
    assert result["day_type"] == "saturday"


def test_saturday_5hrs_30min_break():
    """Saturday 9am–2pm 5hrs, 30min break (4.5 paid hrs) → $149.34 (4.5 × 33.1875)"""
    result = calculate_shift(
        shift_date=date(2025, 1, 11),
        start_time="09:00",
        duration_hours=5.0,
        break_minutes=30,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["gross_pay"] == 149.34
    assert result["paid_hours"] == 4.5
    assert len(result["segments"]) >= 1


def test_thursday_5pm_9pm_4hrs():
    """Thursday 5pm–9pm 4hrs → $114.18"""
    result = calculate_shift(
        shift_date=date(2025, 1, 9),
        start_time="17:00",
        duration_hours=4.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["gross_pay"] == 114.18
    assert result["paid_hours"] == 4.0
    assert len(result["segments"]) >= 1


def test_monday_10am_10pm_12hrs_overtime():
    """Monday 10am–10pm 12hrs overtime → $373.04"""
    result = calculate_shift(
        shift_date=date(2025, 1, 6),
        start_time="10:00",
        duration_hours=12.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["gross_pay"] == 373.04
    assert result["paid_hours"] == 12.0
    assert len(result["segments"]) >= 1


def test_sunday_2hrs_padded_to_3():
    """Sunday 2hrs worked → padded to 3hrs → $119.49"""
    result = calculate_shift(
        shift_date=date(2025, 1, 12),
        start_time="10:00",
        duration_hours=2.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["gross_pay"] == 119.49
    assert result["paid_hours"] == 3.0
    assert any("Minimum casual engagement" in w for w in result["warnings"])
    assert len(result["segments"]) >= 1


def test_saturday_2hrs_padded_to_3():
    """Saturday 2hrs worked → padded to 3hrs → $99.57"""
    result = calculate_shift(
        shift_date=date(2025, 1, 11),
        start_time="09:00",
        duration_hours=2.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["gross_pay"] == 99.57
    assert result["paid_hours"] == 3.0
    assert any("Minimum casual engagement" in w for w in result["warnings"])
    assert len(result["segments"]) >= 1


def test_roster_wed_sat_total():
    """Roster total Wed + Sat → $298.69"""
    wed = calculate_shift(
        shift_date=date(2025, 1, 8),
        start_time="09:00",
        duration_hours=5.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    sat = calculate_shift(
        shift_date=date(2025, 1, 11),
        start_time="09:00",
        duration_hours=5.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    total = round(wed["gross_pay"] + sat["gross_pay"], 2)
    assert total == 298.69


# ---- Extended API tests ----

def test_roster_two_workers():
    """Roster with two workers, different loading: W1 Wed 5hrs 25% → $165.95, W2 Wed 5hrs 0% → $132.75, total $298.70"""
    w1 = calculate_shift(
        shift_date=date(2025, 1, 8),
        start_time="09:00",
        duration_hours=5.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=25,
    )
    w2 = calculate_shift(
        shift_date=date(2025, 1, 8),
        start_time="09:00",
        duration_hours=5.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert w1["gross_pay"] == 165.95
    assert w2["gross_pay"] == 132.75
    total = round(w1["gross_pay"] + w2["gross_pay"], 2)
    assert total == 298.70


def test_worker_classification_penalty_count():
    """PENALTY_MULTIPLIERS should have 7 keys"""
    from app.services.award_rules import PENALTY_MULTIPLIERS
    assert len(PENALTY_MULTIPLIERS) == 7


def test_roster_minimum_engagement_warning():
    """Worker with 1hr Saturday shift → padded to 3hrs, warning present"""
    result = calculate_shift(
        shift_date=date(2025, 1, 11),
        start_time="09:00",
        duration_hours=1.0,
        break_minutes=0,
        is_public_holiday=False,
        casual_loading_percent=0,
    )
    assert result["paid_hours"] == 3.0
    assert any("Minimum casual engagement" in w for w in result["warnings"])
    assert result["gross_pay"] == 99.57
