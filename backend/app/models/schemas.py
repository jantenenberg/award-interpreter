from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class ShiftRequest(BaseModel):
    shift_date: date
    start_time: str                          # HH:MM 24h
    duration_hours: float
    break_minutes: float = 0
    is_public_holiday: bool = False
    kms: float = 0
    allowances: list[str] = []


class ShiftSegment(BaseModel):
    description: str
    hours: float
    rate: float
    cost: float
    penalty_key: str


class ShiftResponse(BaseModel):
    shift_date: date
    day_type: str
    paid_hours: float
    gross_pay: float
    segments: list[ShiftSegment]
    warnings: list[str]


class BulkShiftRequest(BaseModel):
    award_code: str = "MA000004"
    employment_type: str = "CA"
    classification_level: int = 1
    casual_loading_percent: float = Field(default=25, ge=0, le=100)
    worker_id: str
    shifts: list[ShiftRequest]


class BulkShiftResponse(BaseModel):
    worker_id: str
    award_code: str
    rates_version: str
    total_cost: float
    total_hours: float
    shifts: list[ShiftResponse]
    warnings: list[str]


class RatesResponse(BaseModel):
    award_code: str
    rates_version: str
    employment_type: str
    classification_level: int
    ordinary_hourly_rate: float
    casual_loading_percent: float
    penalty_rates: dict[str, float]


class HealthResponse(BaseModel):
    status: str
    environment: str
    rates_version: str
