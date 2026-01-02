"""Aggregates all API routers for inclusion in the main application."""

from fastapi import APIRouter

from . import auth, users, devices, attempts, policies, templates, resources, azure, assessment, security_tests
from . import identity_tests, device_tests

api_router = APIRouter()

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