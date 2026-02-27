"""
Seed the database from MAP CSV files.
Run from the project root:
  python backend/scripts/seed_from_csv.py
"""

import os
import sys
import csv
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
load_dotenv()

from app.database import engine, Base
from app.models.db_models import Award, Classification, WageAllowance, ExpenseAllowance, PenaltyRate
from sqlalchemy.orm import sessionmaker

Session = sessionmaker(bind=engine)


def parse_date(val):
    if not val or val.strip() == '':
        return None
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(val.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_float(val):
    if not val or val.strip() == '':
        return None
    try:
        cleaned = val.strip().replace(',', '').replace('$', '')
        return float(cleaned)
    except ValueError:
        return None


def parse_int(val):
    if not val or val.strip() == '':
        return None
    try:
        return int(float(val.strip()))
    except ValueError:
        return None


def seed_awards(session, csv_path):
    print(f"Seeding awards from {csv_path}...")
    session.query(Award).delete()
    count = 0
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            session.add(Award(
                award_id=row.get('awardID', '').strip(),
                award_fixed_id=row.get('awardFixedID', '').strip() or None,
                award_code=row.get('awardCode', '').strip(),
                name=row.get('name', '').strip(),
                version_number=row.get('versionNumber', '').strip() or None,
                award_operative_from=parse_date(row.get('awardOperativeFrom', '')),
                award_operative_to=parse_date(row.get('awardOperativeTo', '')),
                last_modified_datetime=parse_date(
                    row.get('lastModifiedDateTime', '')),
            ))
            count += 1
    session.commit()
    print(f"  → {count} awards seeded")


def seed_classifications(session, csv_path):
    print(f"Seeding classifications from {csv_path}...")
    session.query(Classification).delete()
    count = 0
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            session.add(Classification(
                award_code=row.get('awardCode', '').strip(),
                employee_rate_type_code=row.get(
                    'employeeRateTypeCode', '').strip(),
                classification=row.get('classification', '').strip(),
                classification_level=parse_int(
                    row.get('classificationLevel', '')) or 1,
                base_rate=parse_float(row.get('baseRate', '')),
                base_rate_type=row.get('baseRateType', '').strip() or None,
                calculated_rate=parse_float(row.get('calculatedRate', '')),
                calculated_rate_type=row.get(
                    'calculatedRateType', '').strip() or None,
                operative_from=parse_date(row.get('operativeFrom', '')),
                operative_to=parse_date(row.get('operativeTo', '')),
            ))
            count += 1
    session.commit()
    print(f"  → {count} classifications seeded")


def seed_wage_allowances(session, csv_path):
    print(f"Seeding wage allowances from {csv_path}...")
    session.query(WageAllowance).delete()
    count = 0
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            session.add(WageAllowance(
                award_code=row.get('awardCode', '').strip(),
                allowance=row.get('allowance', '').strip() or None,
                type=row.get('type', '').strip() or None,
                rate=parse_float(row.get('rate', '')),
                base_rate=parse_float(row.get('baseRate', '')),
                rate_unit=row.get('rateUnit', '').strip() or None,
                allowance_amount=parse_float(row.get('allowanceAmount', '')),
                payment_frequency=row.get(
                    'paymentFrequency', '').strip() or None,
                operative_from=parse_date(row.get('operativeFrom', '')),
                operative_to=parse_date(row.get('operativeTo', '')),
            ))
            count += 1
    session.commit()
    print(f"  → {count} wage allowances seeded")


def seed_expense_allowances(session, csv_path):
    print(f"Seeding expense allowances from {csv_path}...")
    session.query(ExpenseAllowance).delete()
    count = 0
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            session.add(ExpenseAllowance(
                award_code=row.get('awardCode', '').strip(),
                allowance=row.get('allowance', '').strip() or None,
                allowance_amount=parse_float(row.get('allowanceAmount', '')),
                payment_frequency=row.get(
                    'paymentFrequency', '').strip() or None,
                operative_from=parse_date(row.get('OperativeFrom', '')
                    or row.get('operativeFrom', '')),
                operative_to=parse_date(row.get('operativeTo', '')),
            ))
            count += 1
    session.commit()
    print(f"  → {count} expense allowances seeded")


def seed_penalty_rates(session, csv_path):
    print(f"Seeding penalty rates from {csv_path}...")
    session.query(PenaltyRate).delete()
    count = 0
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get('awardCode', '').strip():
                continue
            session.add(PenaltyRate(
                award_code=row.get('awardCode', '').strip(),
                employee_rate_type_code=row.get('employeeRateTypeCode', '').strip(),
                classification=row.get('classification', '').strip(),
                classification_level=parse_int(row.get('classificationLevel', '')) or 1,
                penalty_description=row.get('penaltyDescription', '').strip(),
                rate=parse_float(row.get('rate', '')),
                penalty_rate_unit=row.get('penaltyRateUnit', '').strip() or None,
                penalty_calculated_value=parse_float(row.get('penaltyCalculatedValue', '')),
                operative_from=parse_date(row.get('operativeFrom', '')),
                operative_to=parse_date(row.get('operativeTo', '')),
            ))
            count += 1
            if count % 5000 == 0:
                session.flush()
    session.commit()
    print(f"  → {count} penalty rates seeded")


if __name__ == '__main__':
    BASE = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'source')

    if not engine:
        print("Error: DATABASE_URL not set. Set it in backend/.env or environment.")
        sys.exit(1)

    print("Creating tables if they don't exist...")
    Base.metadata.create_all(bind=engine)

    session = Session()
    try:
        seed_awards(session,
            os.path.join(BASE, 'map-award-export-2025.csv'))
        seed_classifications(session,
            os.path.join(BASE, 'map-classification-export-2025.csv'))
        seed_wage_allowances(session,
            os.path.join(BASE, 'map-wage-allowance-export-2025.csv'))
        seed_expense_allowances(session,
            os.path.join(BASE, 'map-expense-allowance-export-2025.csv'))
        seed_penalty_rates(session,
            os.path.join(BASE, 'map-penalty-export-2025.csv'))
        print("\nAll done. Database seeded successfully.")
    except Exception as e:
        session.rollback()
        print(f"\nError: {e}")
        raise
    finally:
        session.close()
