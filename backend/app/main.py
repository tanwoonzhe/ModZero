"""Main entrypoint for the ModZero backend."""

import os
import secrets
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

from .settings import get_settings
from .db import init_db
from .routers import api_router
from .init_superuser import create_initial_superuser
from .sio_server import get_sio_app


settings = get_settings()

# HTTP Basic auth for docs - use same credentials as superuser
# This allows unified login with admin/admin123 for both app and docs
DOCS_USERNAME = os.getenv("INITIAL_SUPERUSER_USERNAME", "admin")
DOCS_PASSWORD = os.getenv("INITIAL_SUPERUSER_PASSWORD", "admin123")

security = HTTPBasic()


def verify_docs_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    """Verify credentials for accessing API documentation.

    Uses the same credentials as the initial superuser for consistency.
    Username: admin (or INITIAL_SUPERUSER_USERNAME env var)
    Password: admin123 (or INITIAL_SUPERUSER_PASSWORD env var)
    """
    correct_username = secrets.compare_digest(credentials.username, DOCS_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, DOCS_PASSWORD)
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

# CORS configuration: use CORS_ORIGINS env var (comma-separated) or "*" for dev.
_cors_origins = settings.cors_origins.split(",") if settings.cors_origins != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router under /api
app.include_router(api_router, prefix="/api")

# Mount Socket.IO server
sio_asgi_app = get_sio_app()
app.mount("/socket.io", sio_asgi_app)


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


# Public endpoint to serve setup.sh for connector installation
@app.get("/public/connector/setup.sh", include_in_schema=False)
async def get_setup_script():
    """Serve the connector setup script for curl|bash installation."""
    script_path = os.path.join(os.path.dirname(__file__), "..", "setup.sh")
    if os.path.exists(script_path):
        return FileResponse(script_path, media_type="text/plain")
    # Return embedded script if file not found
    return PlainTextResponse(
        "#!/bin/bash\necho 'Setup script not found. Please download from the controller.'\nexit 1\n",
        media_type="text/plain",
    )


@app.on_event("startup")
def on_startup() -> None:
    """Initialize database on startup."""
    init_db()
    create_initial_superuser()


# Serve static frontend files if present (e.g. after `npm run build`)
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


@app.get("/health")
def health() -> JSONResponse:
    """Health check endpoint."""
    return JSONResponse({"status": "ok"})
