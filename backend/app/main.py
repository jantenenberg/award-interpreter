from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import calculate, rates, health, reference_data

app = FastAPI(
    title="Award Interpreter API",
    description="Fair Work Award calculation engine for MA000004",
    version="1.0.0",
)

# CORS — open for now, locked down per client in Phase 3
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
app.include_router(health.router)
app.include_router(rates.router)
app.include_router(calculate.router)
app.include_router(reference_data.router)

# Serve existing frontend static files from project root (parent of backend/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
app.mount("/", StaticFiles(directory=str(PROJECT_ROOT), html=True), name="frontend")
