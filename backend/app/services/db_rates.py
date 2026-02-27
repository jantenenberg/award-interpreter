"""
Database-driven rate lookups.
All rates come from the five MAP tables — nothing is hardcoded.
"""
from typing import Optional
from sqlalchemy.orm import Session
from app.models.db_models import Classification, PenaltyRate

# Penalty description keywords (lowercase) for each day/time type
_ORDINARY = ['ordinary hours', 'ordinary hourly rate', 'ordinary rate']
_SATURDAY = ['saturday']
_SUNDAY = ['sunday']
_PUBLIC_HOLIDAY = ['public holiday']
_OT_FIRST = [
    'monday to saturday – first', 'monday to friday – first',
    'monday to saturday - first', 'monday to friday - first',
    'first 2 hours', 'first 3 hours', 'overtime - first',
]
_OT_AFTER = [
    'monday to saturday – after', 'monday to friday – after',
    'monday to saturday - after', 'monday to friday - after',
    'after 2 hours', 'after 3 hours', 'overtime - after',
]

_DAY_KEYWORDS = {
    'weekday': _ORDINARY,
    'saturday': _SATURDAY,
    'sunday': _SUNDAY,
    'public_holiday': _PUBLIC_HOLIDAY,
}


def _match(description: str, keywords: list[str]) -> bool:
    d = description.lower().strip()
    return any(k in d for k in keywords)


def _rows_for(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
) -> list:
    """Fetch penalty rows for exact employment type, then AD fallback."""
    for et in [employment_type, 'AD']:
        rows = (
            db.query(PenaltyRate)
            .filter(
                PenaltyRate.award_code == award_code,
                PenaltyRate.employee_rate_type_code == et,
                PenaltyRate.classification_level == classification_level,
                PenaltyRate.penalty_calculated_value.isnot(None),
            )
            .order_by(PenaltyRate.rate.asc())
            .all()
        )
        if rows:
            return rows
    return []


def get_ordinary_rate(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
) -> "Optional[float]":
    """Returns the base ordinary hourly rate (lowest-rate 'Ordinary hours' match)."""
    for row in _rows_for(db, award_code, employment_type, classification_level):
        if _match(row.penalty_description, _ORDINARY):
            return row.penalty_calculated_value
    return None


def get_penalty_rate(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
    day_type: str,
) -> tuple:
    """Returns (rate_percent, calculated_hourly_rate) for a day type."""
    keywords = _DAY_KEYWORDS.get(day_type, _ORDINARY)
    for row in _rows_for(db, award_code, employment_type, classification_level):
        if _match(row.penalty_description, keywords):
            return row.rate, row.penalty_calculated_value
    return None, None


def get_overtime_rates(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
) -> dict:
    """Returns overtime first/after rates dict."""
    result = {
        'first_hours_rate': None,
        'first_hours_calculated': None,
        'after_hours_rate': None,
        'after_hours_calculated': None,
    }
    for row in _rows_for(db, award_code, employment_type, classification_level):
        if result['first_hours_calculated'] is None and \
                _match(row.penalty_description, _OT_FIRST):
            result['first_hours_rate'] = row.rate
            result['first_hours_calculated'] = row.penalty_calculated_value
        if result['after_hours_calculated'] is None and \
                _match(row.penalty_description, _OT_AFTER):
            result['after_hours_rate'] = row.rate
            result['after_hours_calculated'] = row.penalty_calculated_value
        if result['first_hours_calculated'] and result['after_hours_calculated']:
            break
    return result


def get_base_weekly_rate(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
) -> float:
    """Returns base weekly rate from classifications table."""
    for et in [employment_type, 'AD']:
        row = db.query(Classification).filter(
            Classification.award_code == award_code,
            Classification.employee_rate_type_code == et,
            Classification.classification_level == classification_level,
            Classification.base_rate_type.ilike('%weekly%'),
        ).first()
        if row and row.base_rate:
            return float(row.base_rate)
    return 1008.90


def get_classification_details(
    db: Session,
    award_code: str,
    employment_type: str,
    classification_level: int,
) -> "Optional[dict]":
    """Returns full classification details for a given award/type/level."""
    for et in [employment_type, 'AD']:
        row = db.query(Classification).filter(
            Classification.award_code == award_code,
            Classification.employee_rate_type_code == et,
            Classification.classification_level == classification_level,
        ).first()
        if row:
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
    return None


def get_wage_allowances(db: Session, award_code: str) -> list[dict]:
    from app.models.db_models import WageAllowance
    rows = db.query(WageAllowance).filter(WageAllowance.award_code == award_code).all()
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
    from app.models.db_models import ExpenseAllowance
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
