"""DEV102 proctoring agent: FastAPI service called only by the API (X-Agent-Key), never by browsers."""
from __future__ import annotations

import asyncio
import hmac
import logging
import time

from fastapi import Depends, FastAPI, Header, HTTPException

import vision
from agents import face_agent
from agents.orchestrator import orchestrator
from config import settings
from schemas import AnalysisResult, BrowsingRequest, FaceVerifyRequest, FaceVerifyResult, FrameRequest, RiskResult, ScreenRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agent")
STARTED = time.time()

app = FastAPI(title="DEV102 Proctoring Agent", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)


def require_key(x_agent_key: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_agent_key.encode(), settings.agent_key.encode()):
        raise HTTPException(status_code=401, detail="invalid agent key")


@app.on_event("startup")
async def warm_up() -> None:
    status = await asyncio.to_thread(vision.ensure_models)
    log.info("vision ready: %s · llm %s", status, "on" if settings.llm_enabled else "off")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "uptimeSec": round(time.time() - STARTED), "vision": vision.ensure_models(), "llm": settings.llm_enabled, "sessions": orchestrator.active}


@app.post("/analyze/frame", response_model=AnalysisResult, dependencies=[Depends(require_key)])
async def analyze_frame(req: FrameRequest) -> AnalysisResult:
    return await orchestrator.frame(req.sessionId, req.imageBase64, req.registeredFaceBase64)


@app.post("/analyze/screen", response_model=AnalysisResult, dependencies=[Depends(require_key)])
async def analyze_screen(req: ScreenRequest) -> AnalysisResult:
    return await orchestrator.screen(req.sessionId, req.imageBase64)


@app.post("/analyze/browsing", response_model=AnalysisResult, dependencies=[Depends(require_key)])
async def analyze_browsing(req: BrowsingRequest) -> AnalysisResult:
    return await orchestrator.browsing(req.sessionId, req.entries, req.examTexts)


@app.post("/verify/face", response_model=FaceVerifyResult, dependencies=[Depends(require_key)])
async def verify_face(req: FaceVerifyRequest) -> FaceVerifyResult:
    return await asyncio.to_thread(face_agent.verify, req.imageBase64, req.registeredBase64)


@app.get("/risk/{session_id}", response_model=RiskResult, dependencies=[Depends(require_key)])
async def risk(session_id: str) -> RiskResult:
    return orchestrator.risk(session_id[:64])
