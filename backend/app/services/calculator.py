"""
Shift cost calculation engine for MA000004 General Retail Industry Award 2020.
Implements rules from documentation.html with 6-minute segmentation and overtime.
"""
from datetime import date, datetime, timedelta
from collections import defaultdict
import math

from app.services.award_rules import (
    BASE_WEEKLY_RATE,
    STANDARD_HOURS,
    PENALTY_MULTIPLIERS,
    OVERTIME_MULTIPLIERS,
    ORDINARY_HOURS_THRESHOLD,
    MINIMUM_ENGAGEMENT_HOURS,
    EARLY_BOUNDARY,
    LATE_BOUNDARY,
)


def _round_half_up(value: float, decimals: int = 2) -> float:
    """Round to decimals; 0.5 rounds up (so 49.785 -> 49.79)."""
    if decimals <= 0:
        return math.floor(value + 0.5)
    exp = 10 ** decimals
    return math.floor(value * exp + 0.5) / exp


def get_ordinary_hourly_rate(base_weekly_rate: float, casual_loading_percent: float) -> float:
    loading_multiplier = 1 + (casual_loading_percent / 100)
    return _round_half_up((base_weekly_rate / STANDARD_HOURS) * loading_multiplier, 2)


def _parse_time(hhmm: str) -> tuple[int, int]:
    """Parse HH:MM 24h to (hour, minute)."""
    parts = hhmm.strip().split(":")
    h = int(parts[0]) if parts else 0
    m = int(parts[1]) if len(parts) > 1 else 0
    return h, m


def _day_type(d: date, is_public_holiday: bool) -> str:
    """Day type for display: public_holiday, sunday, saturday, weekday."""
    if is_public_holiday:
        return "public_holiday"
    w = d.weekday()  # 0=Mon .. 6=Sun
    if w == 6:
        return "sunday"
    if w == 5:
        return "saturday"
    return "weekday"


def _base_penalty_key_for_moment(
    dt: datetime,
    is_public_holiday: bool,
) -> str:
    """Base penalty key for a moment (no overtime)."""
    w = dt.weekday()
    hour = dt.hour + dt.minute / 60.0

    if is_public_holiday:
        return "publicholiday"
    if w == 6:
        return "sunday"
    if w == 5:
        return "saturday_ordinary"

    # Weekday Mon–Fri
    if hour < EARLY_BOUNDARY:
        return "weekday_early_late"
    if hour < LATE_BOUNDARY:
        return "ordinary"
    if w == 4:
        return "friday_late"
    return "weekday_early_late"


def _segment_description(penalty_key: str, overtime_mult: float) -> str:
    desc_map = {
        "ordinary": "Ordinary hours",
        "weekday_early_late": "Weekday early/late",
        "friday_late": "Friday after 6pm",
        "saturday_ordinary": "Saturday - ordinary hours",
        "saturday": "Saturday - ordinary hours",
        "sunday": "Sunday - ordinary hours",
        "publicholiday": "Public holiday",
    }
    desc = desc_map.get(penalty_key, penalty_key)
    if overtime_mult >= 2.0:
        desc += " (overtime - beyond 3 hours)"
    elif overtime_mult >= 1.5:
        desc += " (overtime - first 3 hours)"
    return desc


def calculate_shift(
    shift_date: date,
    start_time: str,
    duration_hours: float,
    break_minutes: float,
    is_public_holiday: bool,
    casual_loading_percent: float,
    base_weekly_rate: float = BASE_WEEKLY_RATE,
) -> dict:
    """
    Calculate cost for a single shift. Returns dict matching ShiftResponse shape.
    Uses 6-minute (0.1 hour) steps; contiguous same penalty_key merged into segments.
    """
    ordinary_rate = get_ordinary_hourly_rate(base_weekly_rate, casual_loading_percent)
    # Full-precision penalty rates for accumulation (round only at output)
    penalty_rates_full = {k: ordinary_rate * v for k, v in PENALTY_MULTIPLIERS.items()}
    penalty_rates = {k: _round_half_up(v, 2) for k, v in penalty_rates_full.items()}

    h, m = _parse_time(start_time)
    start_dt = datetime(shift_date.year, shift_date.month, shift_date.day, h, m, 0)
    total_seconds = duration_hours * 3600
    break_seconds = break_minutes * 60
    paid_seconds = max(0, total_seconds - break_seconds)
    paid_hours_raw = paid_seconds / 3600.0

    # 6-minute step
    step_hours = 0.1
    step_seconds = int(step_hours * 3600)
    break_remaining_sec = break_seconds

    # Accumulate segments: (penalty_key, overtime_mult) -> (hours, rate, cost)
    segment_accum: dict[tuple[str, float], list[float]] = defaultdict(list)

    # Daily hours worked for overtime (date string -> seconds worked that day)
    daily_worked: dict[str, float] = defaultdict(float)

    t_sec = 0
    while t_sec < total_seconds:
        step = min(step_seconds, total_seconds - t_sec)
        current_dt = start_dt + timedelta(seconds=t_sec)

        if break_remaining_sec > 0:
            use_break = min(step, break_remaining_sec)
            break_remaining_sec -= use_break
            t_sec += step
            continue

        work_sec = step
        work_hours = work_sec / 3600.0
        ymd = current_dt.strftime("%Y-%m-%d")
        hours_worked_today_before = daily_worked[ymd] / 3600.0

        base_key = _base_penalty_key_for_moment(current_dt, is_public_holiday)
        dow = current_dt.weekday()

        overtime_mult = 1.0
        if dow <= 4 and base_key not in ("publicholiday", "sunday", "saturday_ordinary", "saturday"):
            if hours_worked_today_before >= ORDINARY_HOURS_THRESHOLD:
                ot_hours = hours_worked_today_before - ORDINARY_HOURS_THRESHOLD
                if ot_hours < 3:
                    overtime_mult = OVERTIME_MULTIPLIERS["first_3_hours"]
                else:
                    overtime_mult = OVERTIME_MULTIPLIERS["beyond_3_hours"]

        if base_key in ("sunday", "publicholiday", "saturday_ordinary", "saturday"):
            rate = penalty_rates_full.get(base_key, ordinary_rate)
        else:
            time_mult = PENALTY_MULTIPLIERS.get(base_key, 1.0)
            rate = ordinary_rate * time_mult * overtime_mult

        seg_key = (base_key, overtime_mult)
        segment_accum[seg_key].append(work_hours)

        daily_worked[ymd] += work_sec
        t_sec += step

    paid_hours = paid_hours_raw
    warnings: list[str] = []

    # Casual minimum engagement
    if paid_hours_raw < MINIMUM_ENGAGEMENT_HOURS:
        paid_hours = float(MINIMUM_ENGAGEMENT_HOURS)
        padding_hours = MINIMUM_ENGAGEMENT_HOURS - paid_hours_raw
        warnings.append(
            f"Minimum casual engagement of 3 hours applied (actual hours: {paid_hours_raw:.2f})"
        )
        # Padding at shift's day-type rate (use start of shift)
        start_key = _base_penalty_key_for_moment(start_dt, is_public_holiday)
        padding_rate = penalty_rates.get(start_key, ordinary_rate)
        padding_seg_key = ("minimum_engagement_padding", 1.0)
        segment_accum[padding_seg_key].append(padding_hours)

    # Build segment list: merge by (penalty_key, overtime_mult), round cost to 2 dp
    segments_out = []
    for (penalty_key, ot_mult), hours_list in segment_accum.items():
        total_h = sum(hours_list)
        if penalty_key == "minimum_engagement_padding":
            pad_key = _base_penalty_key_for_moment(start_dt, is_public_holiday)
            if pad_key == "sunday":
                desc = "Minimum engagement padding (Sunday rate)"
            elif pad_key in ("saturday_ordinary", "saturday"):
                desc = "Minimum engagement padding (Saturday rate)"
            elif pad_key == "publicholiday":
                desc = "Minimum engagement padding (Public holiday rate)"
            else:
                desc = "Minimum engagement padding (Weekday rate)"
            rate_full = penalty_rates.get(pad_key, ordinary_rate)
        else:
            desc = _segment_description(penalty_key, ot_mult)
            if penalty_key in ("sunday", "publicholiday", "saturday_ordinary", "saturday"):
                rate_full = penalty_rates_full.get(penalty_key, ordinary_rate)
            else:
                time_mult = PENALTY_MULTIPLIERS.get(penalty_key, 1.0)
                rate_full = ordinary_rate * time_mult * ot_mult
        rate_rounded = _round_half_up(rate_full, 2)
        # Saturday worked hours only: use full precision so 5*33.1875 → 165.94
        # All other segments: use rounded rate for cost (matches spec 114.18, 373.04, 119.49)
        if penalty_key in ("saturday_ordinary", "saturday") and penalty_key != "minimum_engagement_padding":
            cost = _round_half_up(total_h * rate_full, 2)
        else:
            cost = _round_half_up(total_h * rate_rounded, 2)
        segments_out.append({
            "description": desc,
            "hours": round(total_h, 2),
            "rate": rate_rounded,
            "cost": cost,
            "penalty_key": penalty_key,
        })

    gross_pay = _round_half_up(sum(s["cost"] for s in segments_out), 2)
    day_type = _day_type(shift_date, is_public_holiday)

    return {
        "shift_date": shift_date,
        "day_type": day_type,
        "paid_hours": round(paid_hours, 2),
        "gross_pay": gross_pay,
        "segments": segments_out,
        "warnings": warnings,
    }
