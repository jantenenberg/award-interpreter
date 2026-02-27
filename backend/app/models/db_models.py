from sqlalchemy import Column, String, Float, Integer, Date, DateTime
from app.database import Base


class Award(Base):
    __tablename__ = "awards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    award_id = Column(String, unique=True, index=True)
    award_fixed_id = Column(String, nullable=True)
    award_code = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    version_number = Column(String, nullable=True)
    award_operative_from = Column(Date, nullable=True)
    award_operative_to = Column(Date, nullable=True)
    last_modified_datetime = Column(DateTime, nullable=True)


class Classification(Base):
    __tablename__ = "classifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    award_code = Column(String, index=True, nullable=False)
    employee_rate_type_code = Column(String, nullable=False)
    classification = Column(String, nullable=False)
    classification_level = Column(Integer, nullable=False)
    base_rate = Column(Float, nullable=True)
    base_rate_type = Column(String, nullable=True)
    calculated_rate = Column(Float, nullable=True)
    calculated_rate_type = Column(String, nullable=True)
    operative_from = Column(Date, nullable=True)
    operative_to = Column(Date, nullable=True)


class WageAllowance(Base):
    __tablename__ = "wage_allowances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    award_code = Column(String, index=True, nullable=False)
    allowance = Column(String, nullable=True)
    type = Column(String, nullable=True)
    rate = Column(Float, nullable=True)
    base_rate = Column(Float, nullable=True)
    rate_unit = Column(String, nullable=True)
    allowance_amount = Column(Float, nullable=True)
    payment_frequency = Column(String, nullable=True)
    operative_from = Column(Date, nullable=True)
    operative_to = Column(Date, nullable=True)


class ExpenseAllowance(Base):
    __tablename__ = "expense_allowances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    award_code = Column(String, index=True, nullable=False)
    allowance = Column(String, nullable=True)
    allowance_amount = Column(Float, nullable=True)
    payment_frequency = Column(String, nullable=True)
    operative_from = Column(Date, nullable=True)
    operative_to = Column(Date, nullable=True)
