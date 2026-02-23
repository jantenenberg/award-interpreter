# Forex Trading System – Backend

Python 3.11+ backend with FastAPI, async SQLAlchemy 2.0, PostgreSQL, and Alembic.

## Phase 1: Database setup and models

- **Models:** `TradingParameters`, `Trade`, `MarketData`, `DailyStatistics`
- **Migrations:** Alembic (async) with initial schema in `alembic/versions/001_initial_schema.py`

## Setup

1. **Create a virtual environment and install dependencies**

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env and set DATABASE_URL for your PostgreSQL instance
   # Example: postgresql+asyncpg://user:password@localhost:5432/forex_trading
   ```

3. **Create the database**

   Create a PostgreSQL 15 database (e.g. `forex_trading`).

4. **Run migrations**

   ```bash
   # From backend directory with .venv activated
   alembic upgrade head
   ```

5. **Run the app (optional)**

   ```bash
   uvicorn app.main:app --reload
   ```

   Then open http://127.0.0.1:8000/health and http://127.0.0.1:8000/docs.

## Project layout

```
backend/
├── app/
│   ├── __init__.py
│   ├── config.py          # Settings from env
│   ├── database.py        # Async engine, session, Base
│   ├── main.py            # FastAPI app
│   └── models/
│       ├── __init__.py
│       ├── trading_parameters.py
│       ├── trade.py
│       ├── market_data.py
│       └── daily_statistics.py
├── alembic/
│   ├── env.py             # Async Alembic env
│   ├── script.py.mako
│   └── versions/
│       └── 001_initial_schema.py
├── alembic.ini
├── .env.example
├── requirements.txt
└── README.md
```

## Next phases (from spec)

- **Phase 2:** OANDA client, indicators, strategy  
- **Phase 3:** Risk manager, trading engine  
- **Phase 4:** Backtesting engine  
- **Phase 5:** API endpoints  
- **Phase 6:** Frontend (React)  
- **Phase 7:** WebSocket integration  
- **Phase 8:** Testing and deployment  
