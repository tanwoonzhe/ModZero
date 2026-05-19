"""Foundation API router — auth and user management only.

Add routers here as each feature layer is implemented and verified.
All other router modules remain available in this package.
"""

from fastapi import APIRouter

from . import auth, users

api_router = APIRouter()


@api_router.get("")
@api_router.get("/")
def api_root() -> dict:
    return {"status": "ok", "app": "ModZero", "docs": "/docs"}


api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
