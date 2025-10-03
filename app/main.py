from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import socketio

from .db import get_db
from .deps import init_db
from .models import AccessLog
from .schemas import TrustEvalRequest, TrustEvalResponse, AccessLogOut
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
def on_startup():
    init_db()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/trust-evaluate", response_model=TrustEvalResponse)
async def trust_evaluate(payload: TrustEvalRequest, request: Request, db: Session = Depends(get_db)):
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
    await sio.emit("login_attempt", {
        "id": log.id,
        "user_upn": log.user_upn,
        "device_id": log.device_id,
        "ip": log.ip,
        "total_score": log.total_score,
        "allowed": log.allowed,
        "ts": str(log.ts),
    })

    return TrustEvalResponse(
        allowed=allowed,
        total_score=total,
        posture_score=p_score,
        context_score=c_score,
        breakdown=breakdown
    )

@app.get("/api/logs", response_model=list[AccessLogOut])
def list_logs(db: Session = Depends(get_db), limit: int = 50):
    rows = db.query(AccessLog).order_by(AccessLog.id.desc()).limit(limit).all()
    # simple serialization; pydantic model will handle dict conversion
    return [
        AccessLogOut(
            id=r.id, user_upn=r.user_upn, device_id=r.device_id,
            ip=r.ip, location=r.location, ts=str(r.ts),
            posture_score=r.posture_score, context_score=r.context_score,
            total_score=r.total_score, allowed=r.allowed,
            breakdown=r.breakdown or {}
        ) for r in rows
    ]
