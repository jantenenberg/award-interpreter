import os
from fastapi import APIRouter

from app.models.schemas import HealthResponse
from app.services.award_rules import RATES_VERSION

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    return {
        "status": "healthy",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "rates_version": RATES_VERSION,
    }
