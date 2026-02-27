import os

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import validate_api_key


async def require_api_key(
    x_org_id: str = Header(..., alias="X-Org-ID"),
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: Session = Depends(get_db),
):
    """Requires both X-Org-ID and X-API-Key headers. Both must match."""
    api_key = validate_api_key(db, x_org_id, x_api_key)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Org ID / API key combination.",
        )
    return api_key


async def require_admin(
    x_admin_secret: str = Header(..., alias="X-Admin-Secret"),
):
    admin_secret = os.getenv("ADMIN_SECRET", "")
    if not admin_secret or x_admin_secret != admin_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing admin secret.",
        )
