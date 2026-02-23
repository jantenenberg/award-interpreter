from fastapi import APIRouter

from app.models.schemas import RatesResponse
from app.services.award_rules import (
    AWARD_CODE,
    RATES_VERSION,
    BASE_WEEKLY_RATE,
    PENALTY_MULTIPLIERS,
)
from app.services.calculator import get_ordinary_hourly_rate

router = APIRouter()


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
