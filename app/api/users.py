"""Users API - list and update roles (MASTER only)"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from app.api.auth import require_master, require_auth, USERS, safe_user

router = APIRouter()


class UpdateRolePayload(BaseModel):
    role: str  # "MASTER" | "USER"


@router.get("")
def list_users(authorization: Optional[str] = Header(None)):
    require_master(authorization)
    return [safe_user(u) for u in USERS]


@router.patch("/{user_id}/role")
def update_role(user_id: str, payload: UpdateRolePayload, authorization: Optional[str] = Header(None)):
    require_master(authorization)

    if payload.role not in ("MASTER", "USER"):
        raise HTTPException(status_code=400, detail="Role inválida. Use MASTER ou USER.")

    user = next((u for u in USERS if u["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    user["role"] = payload.role
    return safe_user(user)


@router.get("/me")
def get_me(authorization: Optional[str] = Header(None)):
    user = require_auth(authorization)
    return safe_user(user)
