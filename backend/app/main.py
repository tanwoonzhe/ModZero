"""Main entrypoint for the ModZero backend."""

import secrets
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

from .settings import get_settings
from .db import init_db
from .routers import api_router
from .init_superuser import create_initial_superuser


settings = get_settings()

# HTTP Basic auth for docs
security = HTTPBasic()


def verify_docs_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    """Verify credentials for accessing API documentation."""
    # In production, use environment variables for these credentials
    correct_username = secrets.compare_digest(credentials.username, "admin")
    correct_password = secrets.compare_digest(credentials.password, settings.secret_key)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials


# Create FastAPI app with docs disabled by default (we'll add protected endpoints)
app = FastAPI(
    title=settings.project_name,
    debug=settings.debug,
    docs_url=None,  # Disable default docs
    redoc_url=None,  # Disable default redoc
    openapi_url=None if not settings.debug else "/openapi.json",  # Protect OpenAPI schema in production
)

# CORS configuration: allow all origins for development.  Adjust in prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router under /api
app.include_router(api_router, prefix="/api")


# Protected documentation endpoints
@app.get("/docs", include_in_schema=False)
async def get_docs(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    """Swagger UI documentation (protected with HTTP Basic auth)."""
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{settings.project_name} - API Docs"
    )


@app.get("/redoc", include_in_schema=False)
async def get_redoc(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    """ReDoc documentation (protected with HTTP Basic auth)."""
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=f"{settings.project_name} - API Docs"
    )


@app.get("/openapi.json", include_in_schema=False)
async def get_openapi_json(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    """OpenAPI schema (protected with HTTP Basic auth)."""
    return app.openapi()


@app.on_event("startup")
def on_startup() -> None:
    """Initialize database on startup."""
    init_db()
    create_initial_superuser()


# Serve static frontend files if present (e.g. after `npm run build`)
import os
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


@app.get("/health")
def health() -> JSONResponse:
    """Health check endpoint."""
    return JSONResponse({"status": "ok"})