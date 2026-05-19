"""Main entrypoint for the ModZero backend."""

import os
import secrets

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from sqlalchemy import text

from .settings import get_settings
from .db import init_db, SessionLocal
from .routers import api_router
from .init_superuser import create_initial_superuser


settings = get_settings()

DOCS_USERNAME = os.getenv("INITIAL_SUPERUSER_USERNAME", "admin")
DOCS_PASSWORD = os.getenv("INITIAL_SUPERUSER_PASSWORD", "admin123")

security = HTTPBasic()


def verify_docs_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    ok_user = secrets.compare_digest(credentials.username, DOCS_USERNAME)
    ok_pass = secrets.compare_digest(credentials.password, DOCS_PASSWORD)
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials


app = FastAPI(
    title=settings.project_name,
    debug=settings.debug,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

_raw_cors = (settings.cors_origins or "*").strip()
_cors_origins: list[str] = (
    ["*"] if _raw_cors == "*"
    else [o.strip() for o in _raw_cors.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/docs", include_in_schema=False)
async def get_docs(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{settings.project_name} - Docs",
    )


@app.get("/redoc", include_in_schema=False)
async def get_redoc(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=f"{settings.project_name} - Docs",
    )


@app.get("/openapi.json", include_in_schema=False)
async def get_openapi_json(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    return app.openapi()


@app.get("/health")
def health() -> JSONResponse:
    """Health check — reports app name and live DB connectivity."""
    db_status = "unreachable"
    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        pass
    return JSONResponse(
        {
            "status": "ok" if db_status == "connected" else "degraded",
            "app": settings.project_name,
            "database": db_status,
        },
        status_code=200,
    )


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    create_initial_superuser()


# Serve compiled frontend if present (production / docker build)
_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
