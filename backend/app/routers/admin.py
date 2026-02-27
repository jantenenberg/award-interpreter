from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin
from app.services.auth import create_api_key, list_api_keys, revoke_api_key

router = APIRouter(prefix="/admin", tags=["admin"])


class CreateKeyRequest(BaseModel):
    org_id: str
    org_name: str


@router.post("/keys", dependencies=[Depends(require_admin)])
async def create_key(request: CreateKeyRequest, db: Session = Depends(get_db)):
    """Create a new org/key pair. Returns raw key once — store it securely."""
    if not request.org_id.strip() or not request.org_name.strip():
        raise HTTPException(status_code=400, detail="org_id and org_name are required.")
    return create_api_key(db, request.org_id, request.org_name)


@router.get("/keys", dependencies=[Depends(require_admin)])
async def get_keys(db: Session = Depends(get_db)):
    """List all org/key pairs (without raw key values)."""
    return {"keys": list_api_keys(db)}


@router.delete("/keys/{key_id}", dependencies=[Depends(require_admin)])
async def revoke_key(key_id: int, db: Session = Depends(get_db)):
    """Revoke a key by ID."""
    success = revoke_api_key(db, key_id)
    if not success:
        raise HTTPException(status_code=404, detail="Key not found.")
    return {"message": f"Key {key_id} revoked."}
