from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db_optional
from app.dependencies import require_api_key
from app.models.schemas import (
    ShiftRequest,
    ShiftResponse,
    ShiftSegment,
    BulkShiftRequest,
    BulkShiftResponse,
    WorkerShiftRequest,
    WorkerShiftResponse,
    RosterRequest,
    RosterResponse,
    ShiftRosterWorker,
    ShiftRosterShift,
    ShiftRosterRequest,
    ShiftWorkerResult,
    ShiftRosterShiftResult,
    WorkerTotal,
    ShiftRosterResponse,
)
from app.services.award_rules import AWARD_CODE, RATES_VERSION, BASE_WEEKLY_RATE
from app.services.calculator import calculate_shift, calculate_shift_from_rates, get_ordinary_hourly_rate
from app.services.db_rates import (
    get_ordinary_rate, get_penalty_rate, get_overtime_rates, get_base_weekly_rate
)

router = APIRouter()


def _fetch_rates_and_calculate(
    db,
    award_code: str,
    employment_type: str,
    classification_level: int,
    casual_loading_percent: float,
    shift_date,
    start_time: str,
    duration_hours: float,
    break_minutes: float,
    is_public_holiday: bool,
) -> dict:
    """Fetch rates from DB and calculate shift cost. Falls back to old engine if DB unavailable."""
    if not db:
        return calculate_shift(
            shift_date=shift_date,
            start_time=start_time,
            duration_hours=duration_hours,
            break_minutes=break_minutes,
            is_public_holiday=is_public_holiday,
            casual_loading_percent=casual_loading_percent,
            base_weekly_rate=BASE_WEEKLY_RATE,
        )
    try:
        ordinary = get_ordinary_rate(db, award_code, employment_type, classification_level)
        _, sat_rate = get_penalty_rate(db, award_code, employment_type, classification_level, 'saturday')
        _, sun_rate = get_penalty_rate(db, award_code, employment_type, classification_level, 'sunday')
        _, ph_rate = get_penalty_rate(db, award_code, employment_type, classification_level, 'public_holiday')
        ot = get_overtime_rates(db, award_code, employment_type, classification_level)

        if ordinary is None:
            base_weekly = get_base_weekly_rate(db, award_code, employment_type, classification_level)
            ordinary = base_weekly / 38.0

        return calculate_shift_from_rates(
            shift_date=shift_date,
            start_time=start_time,
            duration_hours=duration_hours,
            break_minutes=break_minutes,
            is_public_holiday=is_public_holiday,
            ordinary_rate=ordinary,
            saturday_rate=sat_rate,
            sunday_rate=sun_rate,
            public_holiday_rate=ph_rate,
            overtime_first_rate=ot['first_hours_calculated'],
            overtime_after_rate=ot['after_hours_calculated'],
            casual_loading_percent=casual_loading_percent,
        )
    except Exception:
        return calculate_shift(
            shift_date=shift_date,
            start_time=start_time,
            duration_hours=duration_hours,
            break_minutes=break_minutes,
            is_public_holiday=is_public_holiday,
            casual_loading_percent=casual_loading_percent,
            base_weekly_rate=BASE_WEEKLY_RATE,
        )


def _to_segments(result: dict) -> list[ShiftSegment]:
    return [
        ShiftSegment(
            description=s["description"],
            hours=s["hours"],
            rate=s["rate"],
            cost=s["cost"],
            penalty_key=s.get("penalty_key", "ordinary"),
        )
        for s in result["segments"]
    ]


@router.post("/api/v1/calculate/shift", response_model=ShiftResponse)
async def calculate_single_shift(
    request: ShiftRequest,
    award_code: str = "MA000004",
    employment_type: str = "CA",
    classification_level: int = 1,
    casual_loading_percent: float = 25,
    db: Optional[Session] = Depends(get_db_optional),
    _=Depends(require_api_key),
):
    result = _fetch_rates_and_calculate(
        db, award_code, employment_type, classification_level,
        casual_loading_percent,
        request.shift_date, request.start_time, request.duration_hours,
        request.break_minutes, request.is_public_holiday,
    )
    return ShiftResponse(
        shift_date=result["shift_date"],
        day_type=result["day_type"],
        paid_hours=result["paid_hours"],
        gross_pay=result["gross_pay"],
        segments=_to_segments(result),
        warnings=result["warnings"],
    )


@router.post("/api/v1/calculate/bulk", response_model=BulkShiftResponse)
async def calculate_bulk_shifts(
    request: BulkShiftRequest,
    db: Optional[Session] = Depends(get_db_optional),
    _=Depends(require_api_key),
):
    all_warnings: list[str] = []
    shifts_out = []
    total_cost = 0.0
    total_hours = 0.0

    for req in request.shifts:
        result = _fetch_rates_and_calculate(
            db, request.award_code, request.employment_type, request.classification_level,
            request.casual_loading_percent,
            req.shift_date, req.start_time, req.duration_hours,
            req.break_minutes, req.is_public_holiday,
        )
        all_warnings.extend(result["warnings"])
        total_cost += result["gross_pay"]
        total_hours += result["paid_hours"]
        shifts_out.append(
            ShiftResponse(
                shift_date=result["shift_date"],
                day_type=result["day_type"],
                paid_hours=result["paid_hours"],
                gross_pay=result["gross_pay"],
                segments=_to_segments(result),
                warnings=result["warnings"],
            )
        )

    return BulkShiftResponse(
        worker_id=request.worker_id,
        award_code=request.award_code or AWARD_CODE,
        rates_version=RATES_VERSION,
        total_cost=round(total_cost, 2),
        total_hours=round(total_hours, 2),
        shifts=shifts_out,
        warnings=all_warnings,
    )


@router.post("/api/v1/calculate/roster", response_model=RosterResponse)
async def calculate_roster(
    request: RosterRequest,
    db: Optional[Session] = Depends(get_db_optional),
    _=Depends(require_api_key),
):
    roster_warnings: list[str] = []
    workers_out = []
    roster_total_cost = 0.0
    roster_total_hours = 0.0

    for worker in request.workers:
        worker_cost = 0.0
        worker_hours = 0.0
        worker_warnings: list[str] = []
        shifts_out = []

        for req in worker.shifts:
            result = _fetch_rates_and_calculate(
                db, worker.award_code, worker.employment_type, worker.classification_level,
                worker.casual_loading_percent,
                req.shift_date, req.start_time, req.duration_hours,
                req.break_minutes, req.is_public_holiday,
            )
            worker_warnings.extend(result["warnings"])
            worker_cost += result["gross_pay"]
            worker_hours += result["paid_hours"]
            shifts_out.append(
                ShiftResponse(
                    shift_date=result["shift_date"],
                    day_type=result["day_type"],
                    paid_hours=result["paid_hours"],
                    gross_pay=result["gross_pay"],
                    segments=_to_segments(result),
                    warnings=result["warnings"],
                )
            )

        roster_warnings.extend(worker_warnings)
        roster_total_cost += worker_cost
        roster_total_hours += worker_hours

        try:
            base = get_base_weekly_rate(
                db, worker.award_code, worker.employment_type, worker.classification_level
            ) if db else BASE_WEEKLY_RATE
        except Exception:
            base = BASE_WEEKLY_RATE
        ordinary_hourly_rate = get_ordinary_hourly_rate(base, worker.casual_loading_percent)

        workers_out.append(
            WorkerShiftResponse(
                worker_id=worker.worker_id,
                worker_name=worker.worker_name,
                award_code=worker.award_code,
                employment_type=worker.employment_type,
                classification=worker.classification,
                classification_level=worker.classification_level,
                casual_loading_percent=worker.casual_loading_percent,
                ordinary_hourly_rate=ordinary_hourly_rate,
                total_cost=round(worker_cost, 2),
                total_hours=round(worker_hours, 2),
                shifts=shifts_out,
                warnings=worker_warnings,
            )
        )

    return RosterResponse(
        roster_name=request.roster_name,
        rates_version=RATES_VERSION,
        total_cost=round(roster_total_cost, 2),
        total_hours=round(roster_total_hours, 2),
        workers=workers_out,
        warnings=roster_warnings,
    )


@router.post("/api/v1/calculate/shift-roster", response_model=ShiftRosterResponse)
async def calculate_shift_roster(
    request: ShiftRosterRequest,
    db: Optional[Session] = Depends(get_db_optional),
    _=Depends(require_api_key),
):
    workers_by_id = {w.worker_id: w for w in request.workers}
    all_warnings: list[str] = []
    shifts_out: list[ShiftRosterShiftResult] = []
    worker_totals_map: dict[str, dict] = {}
    roster_total_cost = 0.0
    roster_total_hours = 0.0

    for shift in request.shifts:
        shift_worker_results: list[ShiftWorkerResult] = []
        shift_cost = 0.0
        shift_hours = 0.0
        first_day_type = "weekday"

        for wid in shift.worker_ids:
            worker = workers_by_id.get(wid)
            if not worker:
                continue

            result = _fetch_rates_and_calculate(
                db, worker.award_code, worker.employment_type, worker.classification_level,
                worker.casual_loading_percent,
                shift.shift_date, shift.start_time, shift.duration_hours,
                shift.break_minutes, shift.is_public_holiday,
            )

            try:
                base = get_base_weekly_rate(
                    db, worker.award_code, worker.employment_type, worker.classification_level
                ) if db else BASE_WEEKLY_RATE
            except Exception:
                base = BASE_WEEKLY_RATE
            ordinary_hourly_rate = get_ordinary_hourly_rate(base, worker.casual_loading_percent)

            wage_allowance = shift.wage_allowance_costs_by_worker.get(wid, 0.0)
            expense_allowance = shift.expense_allowance_costs_by_worker.get(wid, 0.0)
            gross_with_allowances = result["gross_pay"] + wage_allowance + expense_allowance

            if not shift_worker_results:
                first_day_type = result["day_type"]

            shift_worker_results.append(
                ShiftWorkerResult(
                    worker_id=worker.worker_id,
                    worker_name=worker.worker_name,
                    classification=worker.classification,
                    classification_level=worker.classification_level,
                    employment_type=worker.employment_type,
                    casual_loading_percent=worker.casual_loading_percent,
                    ordinary_hourly_rate=ordinary_hourly_rate,
                    paid_hours=result["paid_hours"],
                    gross_pay=round(gross_with_allowances, 2),
                    wage_allowance_cost=round(wage_allowance, 2),
                    expense_allowance_cost=round(expense_allowance, 2),
                    segments=_to_segments(result),
                    warnings=result["warnings"],
                )
            )
            shift_cost += gross_with_allowances
            shift_hours += result["paid_hours"]
            all_warnings.extend(result["warnings"])

            if wid not in worker_totals_map:
                worker_totals_map[wid] = {"name": worker.worker_name, "hours": 0.0, "cost": 0.0}
            worker_totals_map[wid]["hours"] += result["paid_hours"]
            worker_totals_map[wid]["cost"] += gross_with_allowances

        shifts_out.append(
            ShiftRosterShiftResult(
                shift_date=shift.shift_date,
                start_time=shift.start_time,
                duration_hours=shift.duration_hours,
                break_minutes=shift.break_minutes,
                day_type=first_day_type,
                workers=shift_worker_results,
                shift_total_cost=round(shift_cost, 2),
                shift_total_hours=round(shift_hours, 2),
            )
        )
        roster_total_cost += shift_cost
        roster_total_hours += shift_hours

    worker_totals = [
        WorkerTotal(
            worker_id=wid,
            worker_name=data["name"],
            total_hours=round(data["hours"], 2),
            total_cost=round(data["cost"], 2),
        )
        for wid, data in worker_totals_map.items()
    ]

    return ShiftRosterResponse(
        roster_name=request.roster_name,
        rates_version=RATES_VERSION,
        total_cost=round(roster_total_cost, 2),
        total_hours=round(roster_total_hours, 2),
        shifts=shifts_out,
        worker_totals=worker_totals,
        warnings=all_warnings,
    )
