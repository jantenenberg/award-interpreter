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
from app.models.db_models import Award
from sqlalchemy.orm import sessionmaker

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Tables created.")

# Check the database itself — skip seeding if data is already present.
# This is safer than checking for CSV files, which may be absent or stale.
_check_session = sessionmaker(bind=engine)()
try:
    award_count = _check_session.query(Award).count()
finally:
    _check_session.close()

if award_count > 0:
    print(f"Database already contains {award_count} awards — skipping seed.")
    sys.exit(0)

BASE = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'source')

def source_file(filename):
    return os.path.join(BASE, filename)

def files_exist():
    files = [
        'map-award-export-2025.csv',
        'map-classification-export-2025.csv',
        'map-wage-allowance-export-2025.csv',
        'map-expense-allowance-export-2025.csv',
        'map-penalty-export-2025.csv',
    ]
    return all(os.path.exists(source_file(f)) for f in files)

if not files_exist():
    print("Database is empty and source CSV files are not present — cannot seed.")
    print("Place the 5 MAP CSV exports in data/source/ and redeploy.")
    sys.exit(1)

from scripts.seed_from_csv import (
    seed_awards, seed_classifications,
    seed_wage_allowances, seed_expense_allowances,
    seed_penalty_rates
)

Session = sessionmaker(bind=engine)
session = Session()

try:
    seed_awards(session, source_file('map-award-export-2025.csv'))
    seed_classifications(session, source_file('map-classification-export-2025.csv'))
    seed_wage_allowances(session, source_file('map-wage-allowance-export-2025.csv'))
    seed_expense_allowances(session, source_file('map-expense-allowance-export-2025.csv'))
    seed_penalty_rates(session, source_file('map-penalty-export-2025.csv'))
    print("All done. Database seeded successfully.")
except Exception as e:
    session.rollback()
    print(f"Seed error: {e}")
    raise
finally:
    session.close()