"""
Salesforce-facing endpoints for the configureAward LWC.

  GET /api/v1/awards                          — public, no auth required
  GET /api/v1/classifications/{award_code}    — requires X-Org-ID + X-API-Key
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db, get_db_optional
from app.dependencies import require_api_key
from app.models.db_models import Award, Classification

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
