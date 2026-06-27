"""Tags API - full CRUD with auth"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import uuid
from app.api.auth import require_auth, require_master

router = APIRouter()

# --- In-memory state ---

MOCK_TAGS: list[dict] = [
    {"id": "tag-sql",  "name": "SQL",        "color": "#5EEAD4"},
    {"id": "tag-join", "name": "JOIN",        "color": "#34d399"},
    {"id": "tag-agg",  "name": "Agregação",   "color": "#fbbf24"},
    {"id": "tag-sub",  "name": "Subconsulta", "color": "#f87171"},
    {"id": "tag-idx",  "name": "Índices",     "color": "#a78bfa"},
]


# --- Schemas ---

class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#5EEAD4"

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


# --- Routes ---

@router.get("")
def list_tags(authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return MOCK_TAGS


@router.get("/{tag_id}")
def get_tag(tag_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    tag = next((t for t in MOCK_TAGS if t["id"] == tag_id), None)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.post("")
def create_tag(tag: TagCreate, authorization: Optional[str] = Header(None)):
    require_master(authorization)
    new_tag = {"id": str(uuid.uuid4()), "name": tag.name.strip(), "color": tag.color or "#5EEAD4"}
    MOCK_TAGS.append(new_tag)
    return new_tag


@router.patch("/{tag_id}")
def update_tag(tag_id: str, tag: TagUpdate, authorization: Optional[str] = Header(None)):
    require_master(authorization)
    tag_obj = next((t for t in MOCK_TAGS if t["id"] == tag_id), None)
    if not tag_obj:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.name is not None:
        tag_obj["name"] = tag.name.strip()
    if tag.color is not None:
        tag_obj["color"] = tag.color
    return tag_obj


@router.delete("/{tag_id}")
def delete_tag(tag_id: str, authorization: Optional[str] = Header(None)):
    require_master(authorization)
    global MOCK_TAGS
    original_len = len(MOCK_TAGS)
    MOCK_TAGS = [t for t in MOCK_TAGS if t["id"] != tag_id]
    if len(MOCK_TAGS) == original_len:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"message": "Tag deleted successfully"}