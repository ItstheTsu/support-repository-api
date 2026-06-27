"""Ranking API"""
from fastapi import APIRouter, Header
from typing import Optional
from app.api.auth import require_auth, USERS, SESSIONS

router = APIRouter()

@router.get("")
def get_ranking(authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    # Placeholder ranking — replace with real query tracking when DB is connected
    return [
        {
            "userId": u["id"],
            "name": u["name"],
            "resolvedCount": 0,
            "points": 0,
        }
        for u in USERS
    ]