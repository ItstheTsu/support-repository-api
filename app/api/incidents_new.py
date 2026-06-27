"""Incidents API - full CRUD with auth, points and SQL answer validation"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime
from app.api.auth import require_auth, require_master

router = APIRouter()

# --- In-memory state ---

MOCK_TAGS = [
    {"id": "tag-sql",  "name": "SQL",        "color": "#5EEAD4"},
    {"id": "tag-join", "name": "JOIN",        "color": "#34d399"},
    {"id": "tag-agg",  "name": "Agregação",   "color": "#fbbf24"},
    {"id": "tag-sub",  "name": "Subconsulta", "color": "#f87171"},
    {"id": "tag-idx",  "name": "Índices",     "color": "#a78bfa"},
]

MOCK_INCIDENTS: list[dict] = [
    {
        "id": "inc-1",
        "title": "Fix Product Price Query",
        "description": "A query está retornando preços duplicados. Use agregação para corrigir.",
        "difficulty": "medium",
        "points": 50,
        "status": "open",
        "tags": [
            {"id": "tag-sql", "name": "SQL",      "color": "#5EEAD4"},
            {"id": "tag-agg", "name": "Agregação", "color": "#fbbf24"},
        ],
        "sqlSeed": "CREATE TABLE products (id INT, name TEXT, price DECIMAL);\nINSERT INTO products VALUES (1,'Item A',10.00),(1,'Item A',10.00),(2,'Item B',20.00);",
        "sqlAnswer": "SELECT id, name, MAX(price) as price FROM products GROUP BY id, name;",
        "sqlQuery": None,
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat(),
        "resolvedAt": None,
    },
    {
        "id": "inc-2",
        "title": "Count Active Users",
        "description": "Contar usuários ativos nos últimos 30 dias.",
        "difficulty": "easy",
        "points": 25,
        "status": "open",
        "tags": [
            {"id": "tag-sql", "name": "SQL", "color": "#5EEAD4"},
        ],
        "sqlSeed": "CREATE TABLE users (id INT, name TEXT, last_login DATE);\nINSERT INTO users VALUES (1,'Alice','2024-06-01'),(2,'Bob','2024-01-01'),(3,'Carol','2024-06-10');",
        "sqlAnswer": "SELECT COUNT(*) as active_users FROM users WHERE last_login >= CURRENT_DATE - INTERVAL '30 days';",
        "sqlQuery": None,
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat(),
        "resolvedAt": None,
    },
]


# --- Schemas ---

class IncidentCreate(BaseModel):
    title: str
    description: str
    difficulty: str
    points: int = 0
    sqlSeed: Optional[str] = None
    sqlAnswer: Optional[str] = None
    tagIds: List[str] = []

class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[str] = None
    status: Optional[str] = None
    points: Optional[int] = None
    sqlSeed: Optional[str] = None
    sqlAnswer: Optional[str] = None
    tagIds: Optional[List[str]] = None

class RunQueryPayload(BaseModel):
    sqlQuery: str

class ResolvePayload(BaseModel):
    sqlQuery: str


# --- Helpers ---

def find_incident(incident_id: str) -> dict:
    incident = next((i for i in MOCK_INCIDENTS if i["id"] == incident_id), None)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident

def resolve_tags(tag_ids: List[str]) -> list:
    return [t for t in MOCK_TAGS if t["id"] in tag_ids]

def normalize_query(sql: str) -> str:
    """Normalize SQL for comparison: lowercase, collapse whitespace."""
    import re
    return re.sub(r'\s+', ' ', sql.strip().lower().rstrip(';'))


# --- Routes ---

@router.get("")
def list_incidents(
    search: Optional[str] = None,
    status: Optional[str] = None,
    difficulty: Optional[str] = None,
    tags: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    require_auth(authorization)
    incidents = list(MOCK_INCIDENTS)

    if search:
        s = search.lower()
        incidents = [i for i in incidents if s in i["title"].lower() or s in i["description"].lower()]
    if status:
        incidents = [i for i in incidents if i["status"] == status]
    if difficulty:
        incidents = [i for i in incidents if i["difficulty"] == difficulty]
    if tags:
        tag_ids = set(tags.split(","))
        incidents = [i for i in incidents if any(t["id"] in tag_ids for t in i.get("tags", []))]

    # Never expose sqlAnswer to the client
    return [{k: v for k, v in i.items() if k != "sqlAnswer"} for i in incidents]


@router.get("/{incident_id}")
def get_incident(incident_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    incident = find_incident(incident_id)
    return {k: v for k, v in incident.items() if k != "sqlAnswer"}


@router.post("")
def create_incident(data: IncidentCreate, authorization: Optional[str] = Header(None)):
    require_master(authorization)
    now = datetime.now().isoformat()
    incident = {
        "id": str(uuid.uuid4()),
        "title": data.title,
        "description": data.description,
        "difficulty": data.difficulty,
        "points": data.points,
        "status": "open",
        "tags": resolve_tags(data.tagIds),
        "sqlSeed": data.sqlSeed,
        "sqlAnswer": data.sqlAnswer,
        "sqlQuery": None,
        "createdAt": now,
        "updatedAt": now,
        "resolvedAt": None,
    }
    MOCK_INCIDENTS.append(incident)
    return {k: v for k, v in incident.items() if k != "sqlAnswer"}


@router.patch("/{incident_id}")
def update_incident(incident_id: str, data: IncidentUpdate, authorization: Optional[str] = Header(None)):
    require_master(authorization)
    incident = find_incident(incident_id)

    if data.title is not None: incident["title"] = data.title
    if data.description is not None: incident["description"] = data.description
    if data.difficulty is not None: incident["difficulty"] = data.difficulty
    if data.status is not None: incident["status"] = data.status
    if data.points is not None: incident["points"] = data.points
    if data.sqlSeed is not None: incident["sqlSeed"] = data.sqlSeed
    if data.sqlAnswer is not None: incident["sqlAnswer"] = data.sqlAnswer
    if data.tagIds is not None: incident["tags"] = resolve_tags(data.tagIds)

    incident["updatedAt"] = datetime.now().isoformat()
    return {k: v for k, v in incident.items() if k != "sqlAnswer"}


@router.delete("/{incident_id}")
def delete_incident(incident_id: str, authorization: Optional[str] = Header(None)):
    require_master(authorization)
    incident = find_incident(incident_id)
    MOCK_INCIDENTS.remove(incident)
    return {"message": "Incident deleted successfully"}


@router.post("/{incident_id}/run")
def run_query(incident_id: str, body: RunQueryPayload, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    # Placeholder: in production, execute against a sandboxed DB
    return {
        "columns": ["resultado"],
        "rows": [{"resultado": "Simulação — conecte um banco real para executar queries"}],
        "rowCount": 1,
        "durationMs": 1,
    }


@router.post("/{incident_id}/resolve")
def resolve_incident(incident_id: str, body: ResolvePayload, authorization: Optional[str] = Header(None)):
    user = require_auth(authorization)
    incident = find_incident(incident_id)

    expected = incident.get("sqlAnswer", "")
    if not expected:
        raise HTTPException(status_code=400, detail="Este incidente não possui query de resposta definida.")

    if normalize_query(body.sqlQuery) != normalize_query(expected):
        raise HTTPException(status_code=422, detail="Query incorreta. Tente novamente.")

    incident["status"] = "resolved"
    incident["resolvedAt"] = datetime.now().isoformat()
    incident["updatedAt"] = datetime.now().isoformat()
    incident["sqlQuery"] = body.sqlQuery

    return {k: v for k, v in incident.items() if k != "sqlAnswer"}