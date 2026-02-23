from fastapi import APIRouter

from app.models.schemas import (
    ShiftRequest,
    ShiftResponse,
    ShiftSegment,
    BulkShiftRequest,
    BulkShiftResponse,
)
from app.services.award_rules import AWARD_CODE, RATES_VERSION, BASE_WEEKLY_RATE
from app.services.calculator import calculate_shift

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
