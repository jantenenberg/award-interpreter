"""Minimal API — optimization engine to be specified."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Optimization Engine",
    description="Placeholder for optimization engine (new spec to follow).",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/v1")
async def api_info():
    return {"message": "Optimization engine API — awaiting specification."}
