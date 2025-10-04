"""
Entry point for the ModZero FastAPI application.

Defines API routes for trust evaluation, access logs, and template
management.  The application also mounts a static directory under the
root path to serve a simple frontend written in HTML and JavaScript.

Socket.IO is integrated to emit events on each trust evaluation so
that connected admin dashboards can receive live updates.  In this
MVP, the Socket.IO connection remains unauthenticated and should be
secured in later iterations.
"""

from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import socketio

from .db import get_db
from .deps import init_db
from .models import AccessLog, Template
from .schemas import (
    TrustEvalRequest,
    TrustEvalResponse,
    AccessLogOut,
    TemplateIn,
    TemplateOut,
)
from .posture import get_posture_score
from .context_eval import evaluate_context
from .trust_engine import calculate_trust

# Socket.IO server (ASGI)
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = FastAPI(title="ModZero MVP")
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)  # expose this in Uvicorn

# CORS (allow your dev front-end on 5173/3000 etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Initialize resources on startup."""

    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    """Health check endpoint."""

    return {"status": "ok"}


@app.post("/api/trust-evaluate", response_model=TrustEvalResponse)
async def trust_evaluate(
    payload: TrustEvalRequest, request: Request, db: Session = Depends(get_db)
) -> TrustEvalResponse:
    """Evaluate the trustworthiness of a login attempt.

    Combines device posture and context analysis scores, logs the
    attempt, and emits a Socket.IO event for real-time updates.
    """

    # 1) posture
    p_score = get_posture_score(request, payload.device_id)

    # 2) context
    c_score, ip = evaluate_context(request)

    # 3) trust engine
    total, allowed, breakdown = calculate_trust(p_score, c_score)

    # 4) save log
    log = AccessLog(
        user_upn=payload.user_upn,
        device_id=payload.device_id,
        ip=ip,
        location=None,
        posture_score=p_score,
        context_score=c_score,
        total_score=total,
        allowed=allowed,
        breakdown=breakdown,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    # 5) notify admins (Socket.IO)
    await sio.emit(
        "login_attempt",
        {
            "id": log.id,
            "user_upn": log.user_upn,
            "device_id": log.device_id,
            "ip": log.ip,
            "total_score": log.total_score,
            "allowed": log.allowed,
            "ts": str(log.ts),
        },
    )

    return TrustEvalResponse(
        allowed=allowed,
        total_score=total,
        posture_score=p_score,
        context_score=c_score,
        breakdown=breakdown,
    )


@app.get("/api/logs", response_model=list[AccessLogOut])
def list_logs(db: Session = Depends(get_db), limit: int = 50) -> list[AccessLogOut]:
    """Retrieve the most recent access logs."""

    rows = db.query(AccessLog).order_by(AccessLog.id.desc()).limit(limit).all()
    return [
        AccessLogOut(
            id=r.id,
            user_upn=r.user_upn,
            device_id=r.device_id,
            ip=r.ip,
            location=r.location,
            ts=str(r.ts),
            posture_score=r.posture_score,
            context_score=r.context_score,
            total_score=r.total_score,
            allowed=r.allowed,
            breakdown=r.breakdown or {},
        )
        for r in rows
    ]


@app.get("/api/templates", response_model=list[TemplateOut])
def get_templates(db: Session = Depends(get_db)) -> list[TemplateOut]:
    """Return all stored templates."""

    templates = db.query(Template).order_by(Template.id.desc()).all()
    return [
        TemplateOut(
            id=t.id,
            name=t.name,
            content=t.content,
            created_at=str(t.created_at),
        )
        for t in templates
    ]


@app.post("/api/templates", response_model=TemplateOut)
def create_template(
    template: TemplateIn, db: Session = Depends(get_db)
) -> TemplateOut:
    """Create a new template with the given name and content."""

    # Ensure unique template names
    existing = db.query(Template).filter(Template.name == template.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Template name already exists")

    new_template = Template(name=template.name, content=template.content)
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return TemplateOut(
        id=new_template.id,
        name=new_template.name,
        content=new_template.content,
        created_at=str(new_template.created_at),
    )


@app.get("/api/templates/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)) -> TemplateOut:
    """Retrieve a template by its ID."""

    template = db.query(Template).get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateOut(
        id=template.id,
        name=template.name,
        content=template.content,
        created_at=str(template.created_at),
    )


# Mount static directory for the frontend.  The `html=True` option
# serves the index file when navigating to `/`.
app.mount(
    "/",
    StaticFiles(directory="app/static", html=True),
    name="static",
)