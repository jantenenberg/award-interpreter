from fastapi import APIRouter

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
from app.services.calculator import calculate_shift, get_ordinary_hourly_rate

router = APIRouter()


@router.post("/api/v1/calculate/shift", response_model=ShiftResponse)
async def calculate_single_shift(
    request: ShiftRequest,
    award_code: str = "MA000004",
    employment_type: str = "CA",
    classification_level: int = 1,
    casual_loading_percent: float = 25,
):
    result = calculate_shift(
        shift_date=request.shift_date,
        start_time=request.start_time,
        duration_hours=request.duration_hours,
        break_minutes=request.break_minutes,
        is_public_holiday=request.is_public_holiday,
        casual_loading_percent=casual_loading_percent,
        base_weekly_rate=BASE_WEEKLY_RATE,
    )
    return ShiftResponse(
        shift_date=result["shift_date"],
        day_type=result["day_type"],
        paid_hours=result["paid_hours"],
        gross_pay=result["gross_pay"],
        segments=[
            ShiftSegment(
                description=s["description"],
                hours=s["hours"],
                rate=s["rate"],
                cost=s["cost"],
                penalty_key=s["penalty_key"],
            )
            for s in result["segments"]
        ],
        warnings=result["warnings"],
    )


@router.post("/api/v1/calculate/bulk", response_model=BulkShiftResponse)
async def calculate_bulk_shifts(request: BulkShiftRequest):
    all_warnings: list[str] = []
    shifts_out = []
    total_cost = 0.0
    total_hours = 0.0

    for req in request.shifts:
        result = calculate_shift(
            shift_date=req.shift_date,
            start_time=req.start_time,
            duration_hours=req.duration_hours,
            break_minutes=req.break_minutes,
            is_public_holiday=req.is_public_holiday,
            casual_loading_percent=request.casual_loading_percent,
            base_weekly_rate=BASE_WEEKLY_RATE,
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
                segments=[
                    ShiftSegment(
                        description=s["description"],
                        hours=s["hours"],
                        rate=s["rate"],
                        cost=s["cost"],
                        penalty_key=s["penalty_key"],
                    )
                    for s in result["segments"]
                ],
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
async def calculate_roster(request: RosterRequest):
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
            result = calculate_shift(
                shift_date=req.shift_date,
                start_time=req.start_time,
                duration_hours=req.duration_hours,
                break_minutes=req.break_minutes,
                is_public_holiday=req.is_public_holiday,
                casual_loading_percent=worker.casual_loading_percent,
                base_weekly_rate=BASE_WEEKLY_RATE,
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
                    segments=[
                        ShiftSegment(
                            description=s["description"],
                            hours=s["hours"],
                            rate=s["rate"],
                            cost=s["cost"],
                            penalty_key=s["penalty_key"],
                        )
                        for s in result["segments"]
                    ],
                    warnings=result["warnings"],
                )
            )

        roster_warnings.extend(worker_warnings)
        roster_total_cost += worker_cost
        roster_total_hours += worker_hours

        ordinary_hourly_rate = get_ordinary_hourly_rate(
            BASE_WEEKLY_RATE, worker.casual_loading_percent
        )
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
async def calculate_shift_roster(request: ShiftRosterRequest):
    workers_by_id = {w.worker_id: w for w in request.workers}
    all_warnings: list[str] = []
    shifts_out: list[ShiftRosterShiftResult] = []
    worker_totals_map: dict[str, dict] = {}  # worker_id -> { total_hours, total_cost }
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
            result = calculate_shift(
                shift_date=shift.shift_date,
                start_time=shift.start_time,
                duration_hours=shift.duration_hours,
                break_minutes=shift.break_minutes,
                is_public_holiday=shift.is_public_holiday,
                casual_loading_percent=worker.casual_loading_percent,
                base_weekly_rate=BASE_WEEKLY_RATE,
            )
            ordinary_hourly_rate = get_ordinary_hourly_rate(
                BASE_WEEKLY_RATE, worker.casual_loading_percent
            )
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
                    gross_pay=round(result["gross_pay"], 2),
                    segments=[
                        ShiftSegment(
                            description=s["description"],
                            hours=s["hours"],
                            rate=s["rate"],
                            cost=s["cost"],
                            penalty_key=s["penalty_key"],
                        )
                        for s in result["segments"]
                    ],
                    warnings=result["warnings"],
                )
            )
            shift_cost += result["gross_pay"]
            shift_hours += result["paid_hours"]
            all_warnings.extend(result["warnings"])

            if wid not in worker_totals_map:
                worker_totals_map[wid] = {"name": worker.worker_name, "hours": 0.0, "cost": 0.0}
            worker_totals_map[wid]["hours"] += result["paid_hours"]
            worker_totals_map[wid]["cost"] += result["gross_pay"]

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
