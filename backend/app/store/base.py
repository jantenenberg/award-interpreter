"""Base file I/O with async and locking."""

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Optional


def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path) -> Any:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Any) -> None:
    _ensure_dir(path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


async def read_json_async(path: Path) -> Any:
    return await asyncio.to_thread(_read_json, path)


async def write_json_async(path: Path, data: Any) -> None:
    await asyncio.to_thread(_write_json, path, data)
