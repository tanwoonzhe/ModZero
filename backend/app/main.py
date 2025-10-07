"""Main entrypoint for the ModZero backend."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .settings import get_settings
from .db import init_db
from .routers import api_router
from .init_superuser import create_initial_superuser


settings = get_settings()

# Create FastAPI app
app = FastAPI(title=settings.project_name, debug=settings.debug)

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