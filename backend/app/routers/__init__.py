"""Foundation API router — grows as each feature layer is verified.

Registered routers
------------------
  auth    → /api/auth/*
  users   → /api/users/*
  graph   → /api/graph/*
  devices → /api/devices/*
  posture → /api/posture/* and /api/trust/*
"""

from fastapi import APIRouter

from . import auth, users, graph, devices, posture

api_router = APIRouter()


@api_router.get("")
@api_router.get("/")
def api_root() -> dict:
    return {"status": "ok", "app": "ModZero", "docs": "/docs"}


api_router.include_router(auth.router,    prefix="/auth",    tags=["auth"])
api_router.include_router(users.router,   prefix="/users",   tags=["users"])
api_router.include_router(graph.router,                      tags=["graph"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(posture.router,                    tags=["posture"])
