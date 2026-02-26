from fastapi import APIRouter

from app.models.schemas import RatesResponse, WorkerClassificationResponse, PenaltyRateDetail
from app.services.award_rules import (
    AWARD_CODE,
    RATES_VERSION,
    BASE_WEEKLY_RATE,
    PENALTY_MULTIPLIERS,
)
from app.services.calculator import get_ordinary_hourly_rate

router = APIRouter()

PENALTY_DESCRIPTIONS = {
    "ordinary":           ("Ordinary hours",                    "Detail", "B.1.1"),
    "weekday_early_late": ("Monday to Friday after 6.00pm",     "Detail", "B.1.1"),
    "friday_late":        ("Friday after 6.00pm",               "Detail", "B.1.1"),
    "saturday":           ("Saturday",                          "Detail", "B.1.1"),
    "saturday_ordinary":  ("Saturday - ordinary hours",         "Detail", "B.1.1"),
    "sunday":             ("Sunday",                            "Detail", "B.1.1"),
    "publicholiday":      ("Public holiday",                    "Detail", "B.1.1"),
}


@router.get("/api/v1/rates/{award_code}/{employment_type}", response_model=RatesResponse)
async def get_rates(
    award_code: str,
    employment_type: str,
    classification_level: int = 1,
    casual_loading_percent: float = 25,
):
    ordinary_hourly_rate = get_ordinary_hourly_rate(BASE_WEEKLY_RATE, casual_loading_percent)
    penalty_rates = {
        k: round(ordinary_hourly_rate * v, 2)
        for k, v in PENALTY_MULTIPLIERS.items()
    }
    return RatesResponse(
        award_code=award_code,
        rates_version=RATES_VERSION,
        employment_type=employment_type,
        classification_level=classification_level,
        ordinary_hourly_rate=ordinary_hourly_rate,
        casual_loading_percent=casual_loading_percent,
        penalty_rates=penalty_rates,
    )


@router.get(
    "/api/v1/classification/{award_code}/{employment_type}/{classification_level}",
    response_model=WorkerClassificationResponse,
)
async def get_worker_classification(
    award_code: str,
    employment_type: str,
    classification_level: int,
    casual_loading_percent: float = 25,
):
    calculated_rate = get_ordinary_hourly_rate(BASE_WEEKLY_RATE, casual_loading_percent)
    penalty_rates = []
    for key, multiplier in PENALTY_MULTIPLIERS.items():
        desc, type_, clause = PENALTY_DESCRIPTIONS.get(
            key, (key.replace("_", " ").title(), "Detail", None)
        )
        calculated = round(calculated_rate * multiplier, 2)
        penalty_rates.append(
            PenaltyRateDetail(
                description=desc,
                type=type_,
                rate_multiplier=multiplier,
                calculated_rate=calculated,
                unit="Hour",
                clause=clause,
            )
        )
    award_name = "General Retail Industry Award 2020" if award_code == "MA000004" else award_code
    classification = f"Retail Employee Level {classification_level}"
    return WorkerClassificationResponse(
        award_code=award_code,
        award_name=award_name,
        employment_type=employment_type,
        classification=classification,
        classification_level=classification_level,
        base_rate=BASE_WEEKLY_RATE,
        base_rate_type="Weekly",
        calculated_rate=calculated_rate,
        calculated_rate_type="Hourly",
        casual_loading_percent=casual_loading_percent,
        clauses=["17.1"],
        penalty_rates=penalty_rates,
        rates_version=RATES_VERSION,
    )
