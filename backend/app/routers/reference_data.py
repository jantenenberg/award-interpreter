from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db_optional
from app.models.db_models import Award, Classification, PenaltyRate, WageAllowance, ExpenseAllowance

router = APIRouter(prefix="/api/v1/reference-data", tags=["reference-data"])


def _award_row(r: Award) -> dict:
    return {
        "awardCode": r.award_code,
        "awardID": r.award_id or "",
        "name": r.name,
        "versionNumber": r.version_number or "",
        "awardOperativeFrom": r.award_operative_from.isoformat() if r.award_operative_from else None,
        "awardOperativeTo": r.award_operative_to.isoformat() if r.award_operative_to else None,
    }


def _classification_row(r: Classification) -> dict:
    return {
        "awardCode": r.award_code,
        "employeeRateTypeCode": r.employee_rate_type_code,
        "classification": r.classification,
        "classificationLevel": r.classification_level,
        "classificationFixedID": None,
        "parentClassificationName": None,
        "baseRate": r.base_rate,
        "baseRateType": r.base_rate_type or "",
        "calculatedRate": r.calculated_rate,
        "calculatedRateType": r.calculated_rate_type or "",
        "calculatedIncludesAllPurpose": "0",
        "clauses": "",
        "publishedYear": None,
        "isHeading": "0",
        "operativeFrom": r.operative_from.isoformat() if r.operative_from else None,
        "operativeTo": r.operative_to.isoformat() if r.operative_to else None,
    }


def _penalty_row(r: PenaltyRate) -> dict:
    return {
        "awardCode": r.award_code,
        "employeeRateTypeCode": r.employee_rate_type_code,
        "classification": r.classification,
        "classificationLevel": r.classification_level,
        "penaltyDescription": r.penalty_description,
        "type": "Detail",
        "rate": r.rate,
        "penaltyRateUnit": r.penalty_rate_unit or "",
        "penaltyCalculatedValue": r.penalty_calculated_value,
        "clauses": "",
        "clauseLink": "",
        "isHeading": "0",
        "operativeFrom": r.operative_from.isoformat() if r.operative_from else None,
        "operativeTo": r.operative_to.isoformat() if r.operative_to else None,
    }


def _wage_allowance_row(r: WageAllowance) -> dict:
    return {
        "awardCode": r.award_code,
        "allowance": r.allowance or "",
        "type": r.type or "",
        "rate": r.rate,
        "rateUnit": r.rate_unit or "",
        "allowanceAmount": r.allowance_amount,
        "paymentFrequency": r.payment_frequency or "",
        "baseRate": r.base_rate,
        "clauses": "",
        "isHeading": "0",
        "operativeFrom": r.operative_from.isoformat() if r.operative_from else None,
        "operativeTo": r.operative_to.isoformat() if r.operative_to else None,
    }


def _expense_allowance_row(r: ExpenseAllowance) -> dict:
    return {
        "awardCode": r.award_code,
        "allowance": r.allowance or "",
        "type": "",
        "allowanceAmount": r.allowance_amount,
        "paymentFrequency": r.payment_frequency or "",
        "clauses": "",
        "isHeading": "0",
        "operativeFrom": r.operative_from.isoformat() if r.operative_from else None,
        "operativeTo": r.operative_to.isoformat() if r.operative_to else None,
    }


@router.get("/summary")
async def get_summary(db: Optional[Session] = Depends(get_db_optional)):
    if not db:
        return {
            "database_connected": False,
            "awards": 0, "classifications": 0, "penalties": 0,
            "wage_allowances": 0, "expense_allowances": 0,
        }
    return {
        "database_connected": True,
        "awards": db.query(Award).count(),
        "classifications": db.query(Classification).count(),
        "penalties": db.query(PenaltyRate).count(),
        "wage_allowances": db.query(WageAllowance).count(),
        "expense_allowances": db.query(ExpenseAllowance).count(),
    }


@router.get("/awards")
async def get_awards(
    limit: int = Query(default=500, le=1000),
    offset: int = Query(default=0),
    db: Optional[Session] = Depends(get_db_optional),
):
    if not db:
        return {"total": 0, "rows": [], "offset": offset, "limit": limit}
    query = db.query(Award).order_by(Award.award_code)
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {"total": total, "rows": [_award_row(r) for r in rows], "offset": offset, "limit": limit}


@router.get("/classifications")
async def get_classifications(
    award_code: Optional[str] = None,
    limit: int = Query(default=20000, le=25000),
    offset: int = Query(default=0),
    db: Optional[Session] = Depends(get_db_optional),
):
    if not db:
        return {"total": 0, "rows": [], "offset": offset, "limit": limit}
    query = db.query(Classification).order_by(
        Classification.award_code, Classification.classification_level
    )
    if award_code:
        query = query.filter(Classification.award_code == award_code)
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {"total": total, "rows": [_classification_row(r) for r in rows], "offset": offset, "limit": limit}


@router.get("/penalties")
async def get_penalties(
    award_code: Optional[str] = None,
    limit: int = Query(default=60000, le=70000),
    offset: int = Query(default=0),
    db: Optional[Session] = Depends(get_db_optional),
):
    if not db:
        return {"total": 0, "rows": [], "offset": offset, "limit": limit}
    query = db.query(PenaltyRate).order_by(
        PenaltyRate.award_code, PenaltyRate.classification_level
    )
    if award_code:
        query = query.filter(PenaltyRate.award_code == award_code)
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {"total": total, "rows": [_penalty_row(r) for r in rows], "offset": offset, "limit": limit}


@router.get("/wage-allowances")
async def get_wage_allowances(
    award_code: Optional[str] = None,
    limit: int = Query(default=3000, le=5000),
    offset: int = Query(default=0),
    db: Optional[Session] = Depends(get_db_optional),
):
    if not db:
        return {"total": 0, "rows": [], "offset": offset, "limit": limit}
    query = db.query(WageAllowance).order_by(WageAllowance.award_code)
    if award_code:
        query = query.filter(WageAllowance.award_code == award_code)
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {"total": total, "rows": [_wage_allowance_row(r) for r in rows], "offset": offset, "limit": limit}


@router.get("/expense-allowances")
async def get_expense_allowances(
    award_code: Optional[str] = None,
    limit: int = Query(default=2000, le=5000),
    offset: int = Query(default=0),
    db: Optional[Session] = Depends(get_db_optional),
):
    if not db:
        return {"total": 0, "rows": [], "offset": offset, "limit": limit}
    query = db.query(ExpenseAllowance).order_by(ExpenseAllowance.award_code)
    if award_code:
        query = query.filter(ExpenseAllowance.award_code == award_code)
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {"total": total, "rows": [_expense_allowance_row(r) for r in rows], "offset": offset, "limit": limit}
