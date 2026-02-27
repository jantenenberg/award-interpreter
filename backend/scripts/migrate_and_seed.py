"""
Creates tables directly using SQLAlchemy and seeds from CSV files.
Bypasses Alembic entirely for Railway deployment.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("WARNING: DATABASE_URL not set, skipping migration and seed")
    sys.exit(0)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

os.environ["DATABASE_URL"] = DATABASE_URL

from app.database import engine, Base
from app.models import db_models  # noqa
from scripts.seed_from_csv import (
    seed_awards, seed_classifications,
    seed_wage_allowances, seed_expense_allowances,
    seed_penalty_rates
)
from sqlalchemy.orm import sessionmaker

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Tables created.")

Session = sessionmaker(bind=engine)
session = Session()

BASE = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'source')

try:
    seed_awards(session, os.path.join(BASE, 'map-award-export-2025.csv'))
    seed_classifications(session, os.path.join(BASE, 'map-classification-export-2025.csv'))
    seed_wage_allowances(session, os.path.join(BASE, 'map-wage-allowance-export-2025.csv'))
    seed_expense_allowances(session, os.path.join(BASE, 'map-expense-allowance-export-2025.csv'))
    seed_penalty_rates(session, os.path.join(BASE, 'map-penalty-export-2025.csv'))
    print("All done. Database seeded successfully.")
except Exception as e:
    session.rollback()
    print(f"Seed error: {e}")
    raise
finally:
    session.close()