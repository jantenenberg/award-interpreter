"""
Salesforce-facing endpoints.

  GET  /api/v1/awards                        — public, no auth required
  GET  /api/v1/classifications/{award_code}  — requires X-Org-ID + X-API-Key
  POST /api/v1/appointment-cost              — requires X-Org-ID + X-API-Key
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db, get_db_optional
from app.dependencies import require_api_key
from app.models.db_models import Award, Classification
from app.models.schemas import (
    AppointmentCostRequest,
    AppointmentCostResponse,
    AppointmentResourceResult,
    ShiftSegment,
)
from app.routers.calculate import _fetch_rates_and_calculate

router = APIRouter(prefix="/api/v1", tags=["salesforce"])


@router.get("/awards")
async def list_awards(
    db: Optional[Session] = Depends(get_db_optional),
):
    """Return all awards for the LWC award picker. No authentication required."""
    if not db:
        return {"awards": []}
    rows = db.query(Award).order_by(Award.award_code).all()
    return {
        "awards": [
            {"award_code": r.award_code, "award_title": r.name}
            for r in rows
        ]
    }


@router.get("/classifications/{award_code}")
async def list_classifications(
    award_code: str,
    employment_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_api_key),
):
    """
    Return classifications for an award, filtered by employment_type when supplied.
    AD (applies-to-all) rows are always included.
    Requires X-Org-ID + X-API-Key authentication.
    """
    query = db.query(Classification).filter(
        Classification.award_code == award_code
    )
    if employment_type:
        query = query.filter(
            Classification.employee_rate_type_code.in_([employment_type, "AD"])
        )
    rows = (
        query
        .order_by(Classification.classification_level, Classification.classification)
        .all()
    )
    return {
        "classifications": [
            {
                "classification": r.classification,
                "classification_level": r.classification_level,
                "base_rate": r.base_rate,
                "base_rate_type": r.base_rate_type or "Weekly",
                "calculated_rate": r.calculated_rate,
                "calculated_rate_type": r.calculated_rate_type or "Hourly",
                "employment_type": r.employee_rate_type_code,
            }
            for r in rows
        ]
    }


@router.post("/appointment-cost", response_model=AppointmentCostResponse)
async def calculate_appointment_cost(
    request: AppointmentCostRequest,
    db: Optional[Session] = Depends(get_db_optional),
    _=Depends(require_api_key),
):
    """
    Calculate the cost of a Maica appointment for each allocated resource.
    Accepts ISO 8601 datetimes (shift_start / shift_end) and converts them
    to the existing shift calculator format (date + time + duration).
    """
    all_warnings: list[str] = []
    resource_results: list[AppointmentResourceResult] = []
    total_cost = 0.0
    total_hours = 0.0

    for res in request.resources:
        try:
            start_dt = datetime.fromisoformat(res.shift_start)
            end_dt = datetime.fromisoformat(res.shift_end)
            if end_dt <= start_dt:
                raise ValueError("shift_end must be after shift_start")

            shift_date = start_dt.date()
            start_time = start_dt.strftime("%H:%M")
            duration_hours = (end_dt - start_dt).total_seconds() / 3600

            result = _fetch_rates_and_calculate(
                db=db,
                award_code=res.award_code,
                employment_type=res.employment_type,
                classification_level=res.classification_level,
                casual_loading_percent=res.casual_loading_percent,
                shift_date=shift_date,
                start_time=start_time,
                duration_hours=duration_hours,
                break_minutes=0,
                is_public_holiday=False,
            )

            ordinary_rate = (
                res.ordinary_hourly_rate
                if res.ordinary_hourly_rate is not None
                else result.get("ordinary_hourly_rate", result["gross_pay"] / max(result["paid_hours"], 0.001))
            )

            segments = [
                ShiftSegment(
                    description=s["description"],
                    hours=s["hours"],
                    rate=s["rate"],
                    cost=s["cost"],
                    penalty_key=s.get("penalty_key", "ordinary"),
                )
                for s in result["segments"]
            ]

            all_warnings.extend(result["warnings"])
            total_cost += result["gross_pay"]
            total_hours += result["paid_hours"]

            resource_results.append(
                AppointmentResourceResult(
                    resource_id=res.resource_id,
                    resource_name=res.resource_name,
                    award_code=res.award_code,
                    employment_type=res.employment_type,
                    classification=res.classification,
                    classification_level=res.classification_level,
                    ordinary_hourly_rate=round(ordinary_rate, 4),
                    paid_hours=round(result["paid_hours"], 2),
                    gross_pay=round(result["gross_pay"], 2),
                    day_type=result["day_type"],
                    segments=segments,
                    warnings=result["warnings"],
                )
            )

        except Exception as exc:
            resource_results.append(
                AppointmentResourceResult(
                    resource_id=res.resource_id,
                    resource_name=res.resource_name,
                    award_code=res.award_code,
                    employment_type=res.employment_type,
                    classification=res.classification,
                    classification_level=res.classification_level,
                    ordinary_hourly_rate=0.0,
                    paid_hours=0.0,
                    gross_pay=0.0,
                    day_type="unknown",
                    segments=[],
                    warnings=[],
                    error=str(exc),
                )
            )

    return AppointmentCostResponse(
        appointment_id=request.appointment_id,
        total_cost=round(total_cost, 2),
        total_hours=round(total_hours, 2),
        resources=resource_results,
        warnings=list(dict.fromkeys(all_warnings)),  # deduplicate
    )
