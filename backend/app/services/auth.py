import hashlib
import secrets
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import ApiKey


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def generate_api_key() -> str:
    return f"ai_{secrets.token_urlsafe(32)}"


def create_api_key(db: Session, org_id: str, org_name: str) -> dict:
    """Create a new key for an org. Returns raw key once."""
    raw_key = generate_api_key()
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:8]
    api_key = ApiKey(
        org_id=org_id.strip(),
        org_name=org_name.strip(),
        key_hash=key_hash,
        key_prefix=key_prefix,
        is_active=1,
        created_at=datetime.utcnow(),
        total_calls=0,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    return {
        "id": api_key.id,
        "org_id": api_key.org_id,
        "org_name": api_key.org_name,
        "key": raw_key,
        "key_prefix": key_prefix,
        "created_at": api_key.created_at.isoformat(),
        "message": "Store this key securely — it will not be shown again.",
    }


def validate_api_key(db: Session, org_id: str, raw_key: str) -> ApiKey | None:
    """Validate org_id + raw_key combination. Both must match."""
    if not org_id or not raw_key:
        return None
    key_hash = _hash_key(raw_key)
    api_key = db.query(ApiKey).filter(
        ApiKey.org_id == org_id.strip(),
        ApiKey.key_hash == key_hash,
        ApiKey.is_active == 1,
    ).first()
    if api_key:
        api_key.last_used_at = datetime.utcnow()
        api_key.total_calls += 1
        db.commit()
    return api_key


def list_api_keys(db: Session) -> list[dict]:
    keys = db.query(ApiKey).order_by(ApiKey.created_at.desc()).all()
    return [
        {
            "id": k.id,
            "org_id": k.org_id,
            "org_name": k.org_name,
            "key_prefix": k.key_prefix,
            "is_active": bool(k.is_active),
            "created_at": k.created_at.isoformat() if k.created_at else None,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "total_calls": k.total_calls,
        }
        for k in keys
    ]


def revoke_api_key(db: Session, key_id: int) -> bool:
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key:
        return False
    key.is_active = 0
    db.commit()
    return True
