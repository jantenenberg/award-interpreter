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


# --- Worker classification lookup ---

class PenaltyRateDetail(BaseModel):
    description: str
    type: str                    # "Detail" or "Summary"
    rate_multiplier: float
    calculated_rate: float
    unit: str                    # "Percent" or "Hour"
    clause: Optional[str] = None


class WorkerClassificationResponse(BaseModel):
    award_code: str
    award_name: str
    employment_type: str
    classification: str
    classification_level: int
    base_rate: float
    base_rate_type: str          # "Weekly" or "Hourly"
    calculated_rate: float
    calculated_rate_type: str    # "Hourly"
    casual_loading_percent: float
    clauses: list[str]
    penalty_rates: list[PenaltyRateDetail]
    rates_version: str


# --- Roster calculation ---

class WorkerShiftRequest(BaseModel):
    worker_id: str
    worker_name: str
    award_code: str = "MA000004"
    employment_type: str = "CA"
    classification: str = "Retail Employee Level 1"
    classification_level: int = 1
    casual_loading_percent: float = Field(default=25, ge=0, le=100)
    shifts: list[ShiftRequest]


class WorkerShiftResponse(BaseModel):
    worker_id: str
    worker_name: str
    award_code: str
    employment_type: str
    classification: str
    classification_level: int
    casual_loading_percent: float
    ordinary_hourly_rate: float
    total_cost: float
    total_hours: float
    shifts: list[ShiftResponse]
    warnings: list[str]


class RosterRequest(BaseModel):
    roster_name: str
    workers: list[WorkerShiftRequest]


class RosterResponse(BaseModel):
    roster_name: str
    rates_version: str
    total_cost: float
    total_hours: float
    workers: list[WorkerShiftResponse]
    warnings: list[str]


# --- Shift-first roster ---

class ShiftRosterWorker(BaseModel):
    worker_id: str
    worker_name: str
    award_code: str = "MA000004"
    employment_type: str = "CA"
    classification: str = "Retail Employee Level 1"
    classification_level: int = 1
    casual_loading_percent: float = Field(default=25, ge=0, le=100)


class ShiftRosterShift(BaseModel):
    shift_date: date
    start_time: str           # HH:MM 24h
    duration_hours: float
    break_minutes: float = 0
    is_public_holiday: bool = False
    kms: float = 0
    worker_ids: list[str]     # references ShiftRosterWorker.worker_id


class ShiftRosterRequest(BaseModel):
    roster_name: str
    workers: list[ShiftRosterWorker]
    shifts: list[ShiftRosterShift]


class ShiftWorkerResult(BaseModel):
    worker_id: str
    worker_name: str
    classification: str
    classification_level: int
    employment_type: str
    casual_loading_percent: float
    ordinary_hourly_rate: float
    paid_hours: float
    gross_pay: float
    segments: list[ShiftSegment]
    warnings: list[str]


class ShiftRosterShiftResult(BaseModel):
    shift_date: date
    start_time: str
    duration_hours: float
    break_minutes: float
    day_type: str
    workers: list[ShiftWorkerResult]
    shift_total_cost: float
    shift_total_hours: float


class WorkerTotal(BaseModel):
    worker_id: str
    worker_name: str
    total_hours: float
    total_cost: float


class ShiftRosterResponse(BaseModel):
    roster_name: str
    rates_version: str
    total_cost: float
    total_hours: float
    shifts: list[ShiftRosterShiftResult]
    worker_totals: list[WorkerTotal]
    warnings: list[str]
