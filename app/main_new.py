"""Legacy IncidentSQL application. Not the Base do Suporte entry point."""
import os
if os.getenv("LEGACY_INCIDENTSQL_ENABLE") != "1":
    raise RuntimeError("IncidentSQL legado desativado. Use npm start para a Base do Suporte.")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import incidents_new, tags_new, ranking_new, auth, users

app = FastAPI(title="IncidentSQL API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(auth.router,          prefix="/api/auth",      tags=["auth"])
app.include_router(users.router,         prefix="/api/users",     tags=["users"])
app.include_router(tags_new.router,      prefix="/api/tags",      tags=["tags"])
app.include_router(incidents_new.router, prefix="/api/incidents", tags=["incidents"])
app.include_router(ranking_new.router,   prefix="/api/ranking",   tags=["ranking"])
