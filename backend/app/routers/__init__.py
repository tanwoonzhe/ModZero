"""Aggregates all API routers for inclusion in the main application."""

from fastapi import APIRouter

from . import auth, users, devices, attempts, policies, templates, resources, azure, assessment, security_tests
from . import identity_tests, device_tests, test_config, connectors, client_api, identity_checks, custom_policies

api_router = APIRouter()

@api_router.get("")
@api_router.get("/")
def api_root() -> dict:
    """Simple index endpoint for the API root."""
    return {
        "status": "ok",
        "message": "ModZero API root. See /docs for interactive docs.",
    }

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(attempts.router, prefix="/attempts", tags=["attempts"])
api_router.include_router(policies.router, prefix="/policies", tags=["policies"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(azure.router, prefix="/azure", tags=["azure"])
api_router.include_router(assessment.router, prefix="/assessment", tags=["assessment"])
api_router.include_router(security_tests.router, tags=["security-tests"])
api_router.include_router(identity_tests.router, tags=["identity-tests"])
api_router.include_router(device_tests.router, tags=["device-tests"])
api_router.include_router(test_config.router, prefix="/test-config", tags=["test-config"])
api_router.include_router(connectors.router, tags=["connectors"])
api_router.include_router(client_api.router, tags=["client"])
api_router.include_router(identity_checks.router, tags=["identity-checks-zt"])
api_router.include_router(custom_policies.router, prefix="/custom-policies", tags=["custom-policies"])