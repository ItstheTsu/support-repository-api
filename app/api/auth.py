"""Auth API - register, login, me"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import hashlib
import secrets
from datetime import datetime

router = APIRouter()

# --- In-memory state ---

USERS: list[dict] = []
SESSIONS: dict[str, str] = {}  # token -> user_id

# Create default MASTER user on startup
_master_id = str(uuid.uuid4())
USERS.append({
    "id": _master_id,
    "name": "Master",
    "email": "master@incidentsql.com",
    "password_hash": hashlib.sha256("master123".encode()).hexdigest(),
    "role": "MASTER",
    "createdAt": datetime.now().isoformat(),
})


# --- Schemas ---

class RegisterPayload(BaseModel):
    name: str
    email: str
    password: str

class LoginPayload(BaseModel):
    email: str
    password: str


# --- Helpers ---

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def find_user_by_email(email: str) -> Optional[dict]:
    return next((u for u in USERS if u["email"] == email), None)

def find_user_by_id(user_id: str) -> Optional[dict]:
    return next((u for u in USERS if u["id"] == user_id), None)

def safe_user(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}

def get_user_from_token(token: str) -> Optional[dict]:
    user_id = SESSIONS.get(token)
    if not user_id:
        return None
    return find_user_by_id(user_id)


# --- Routes ---

@router.post("/register")
def register(payload: RegisterPayload):
    if not payload.name.strip() or not payload.email.strip() or not payload.password:
        raise HTTPException(status_code=400, detail="Todos os campos são obrigatórios.")

    if find_user_by_email(payload.email):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado.")

    user = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "email": payload.email.strip().lower(),
        "password_hash": hash_password(payload.password),
        "role": "USER",
        "createdAt": datetime.now().isoformat(),
    }
    USERS.append(user)

    token = secrets.token_hex(32)
    SESSIONS[token] = user["id"]

    return {"token": token, "user": safe_user(user)}


@router.post("/login")
def login(payload: LoginPayload):
    user = find_user_by_email(payload.email.strip().lower())
    if not user or user["password_hash"] != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    token = secrets.token_hex(32)
    SESSIONS[token] = user["id"]

    return {"token": token, "user": safe_user(user)}


@router.get("/me")
def me(authorization: Optional[str] = None):
    from fastapi import Request
    raise HTTPException(status_code=400, detail="Use o header Authorization.")


@router.post("/logout")
def logout(token: str):
    SESSIONS.pop(token, None)
    return {"message": "Logout realizado."}


# --- Exposed helpers for other modules ---
def require_auth(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Não autenticado.")
    token = authorization.removeprefix("Bearer ").strip()
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.")
    return user

def require_master(authorization: Optional[str]) -> dict:
    user = require_auth(authorization)
    if user["role"] != "MASTER":
        raise HTTPException(status_code=403, detail="Acesso restrito a MASTER.")
    return user
