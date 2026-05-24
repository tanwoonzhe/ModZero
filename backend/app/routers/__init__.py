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

from . import auth, users, graph, devices, posture, protected_resources, access, connectors, assessment, tunnels, tunnels_bootstrap, tunnels_routes, tunnels_user_enrollment, resource_access, templates, identity_checks, device_checks

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
api_router.include_router(protected_resources.router)
api_router.include_router(access.router)
api_router.include_router(connectors.router)
api_router.include_router(assessment.router, prefix="/assessment", tags=["assessment"])
api_router.include_router(tunnels.router, prefix="/tunnels", tags=["tunnels"])
api_router.include_router(tunnels_bootstrap.router, prefix="/tunnels", tags=["tunnels"])
api_router.include_router(tunnels_routes.router, prefix="/tunnels", tags=["tunnels"])
api_router.include_router(tunnels_user_enrollment.router, prefix="/tunnels", tags=["tunnels"])
api_router.include_router(resource_access.router)
api_router.include_router(templates.router,        prefix="/templates",       tags=["templates"])
api_router.include_router(identity_checks.router,  tags=["identity-checks"])
api_router.include_router(device_checks.router,    tags=["device-checks"])
