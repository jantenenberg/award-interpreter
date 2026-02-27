"""
Fetches award rates and classifications from the database.
Falls back to hardcoded values if database is unavailable.
"""

from sqlalchemy.orm import Session
from app.models.db_models import Classification, WageAllowance, ExpenseAllowance
from app.services.award_rules import BASE_WEEKLY_RATE


def get_base_weekly_rate(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
) -> float:
    """
    Returns the base weekly rate for a given classification.
    Falls back to hardcoded BASE_WEEKLY_RATE if not found in database.
    """
    row = db.query(Classification).filter(
        Classification.award_code == award_code,
        Classification.employee_rate_type_code == employment_type,
        Classification.classification_level == classification_level,
        Classification.base_rate_type.ilike('%weekly%'),
    ).first()

    if row and row.base_rate:
        return float(row.base_rate)

    # Fallback to hardcoded rate
    return BASE_WEEKLY_RATE


def get_classification_details(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
) -> dict | None:
    """
    Returns full classification details for a given award/type/level.
    """
    row = db.query(Classification).filter(
        Classification.award_code == award_code,
        Classification.employee_rate_type_code == employment_type,
        Classification.classification_level == classification_level,
    ).first()

    if not row:
        return None

    return {
        "award_code": award_code,
        "employment_type": employment_type,
        "classification": row.classification,
        "classification_level": row.classification_level,
        "base_rate": row.base_rate,
        "base_rate_type": row.base_rate_type,
        "calculated_rate": row.calculated_rate,
        "calculated_rate_type": row.calculated_rate_type,
    }


def get_wage_allowances(db: Session, award_code: str) -> list[dict]:
    rows = db.query(WageAllowance).filter(
        WageAllowance.award_code == award_code
    ).all()
    return [
        {
            "allowance": r.allowance,
            "type": r.type,
            "rate": r.rate,
            "base_rate": r.base_rate,
            "rate_unit": r.rate_unit,
            "allowance_amount": r.allowance_amount,
            "payment_frequency": r.payment_frequency,
        }
        for r in rows
    ]


def get_expense_allowances(db: Session, award_code: str) -> list[dict]:
    rows = db.query(ExpenseAllowance).filter(
        ExpenseAllowance.award_code == award_code
    ).all()
    return [
        {
            "allowance": r.allowance,
            "allowance_amount": r.allowance_amount,
            "payment_frequency": r.payment_frequency,
        }
        for r in rows
    ]
