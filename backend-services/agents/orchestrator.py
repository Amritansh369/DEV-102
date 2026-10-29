"""Coordinates the agents per session: rate limiting, per-session state, concurrent execution of
CPU-bound vision work off the event loop, de-duplication and risk accounting."""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

import vision
from agents import browsing_agent, face_agent, screen_agent
from agents.face_agent import FaceState
from agents.risk_agent import RiskState
from config import settings
from schemas import AnalysisResult, BrowsingEntry, RiskResult, Violation

MAX_SESSIONS = 5000
IDLE_SEC = 3 * 3600


@dataclass
class SessionState:
    face: FaceState = field(default_factory=FaceState)
    risk: RiskState = field(default_factory=RiskState)
    last_frame: float = 0.0
    seen: float = field(default_factory=time.monotonic)


class Orchestrator:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def _state(self, session_id: str) -> SessionState:
        st = self._sessions.get(session_id)
        if st is None:
            if len(self._sessions) >= MAX_SESSIONS:
                self._evict()
            st = self._sessions[session_id] = SessionState()
        st.seen = time.monotonic()
        return st

    def _evict(self) -> None:
        cutoff = time.monotonic() - IDLE_SEC
        for sid in [s for s, st in self._sessions.items() if st.seen < cutoff] or list(self._sessions)[: MAX_SESSIONS // 10]:
            self._sessions.pop(sid, None)

    @staticmethod
    def _dedupe(vs: list[Violation]) -> list[Violation]:
        best: dict[str, Violation] = {}
        for v in vs:
            if v.code not in best or v.confidence > best[v.code].confidence:
                best[v.code] = v
        return list(best.values())

    def _finish(self, st: SessionState, vs: list[Violation], metrics: dict) -> AnalysisResult:
        vs = self._dedupe(vs)
        delta = sum(st.risk.add(v) for v in vs)
        return AnalysisResult(violations=vs, metrics=metrics, riskDelta=round(delta, 1))

    async def frame(self, session_id: str, image_b64: str, registered_b64: str | None) -> AnalysisResult:
        st = self._state(session_id)
        now = time.monotonic()
        if now - st.last_frame < 1 / settings.max_frames_per_sec:
            return AnalysisResult(metrics={"skipped": "rate_limited"})
        st.last_frame = now
        if registered_b64 and st.face.reference is None:
            await asyncio.to_thread(face_agent.register_reference, st.face, registered_b64)
        img = await asyncio.to_thread(vision.decode, image_b64)
        if img is None:
            return AnalysisResult(metrics={"error": "undecodable"})
        vs, metrics = await asyncio.to_thread(face_agent.analyze_frame, st.face, img)
        return self._finish(st, vs, metrics)

    async def screen(self, session_id: str, image_b64: str) -> AnalysisResult:
        st = self._state(session_id)
        img = await asyncio.to_thread(vision.decode, image_b64)
        if img is None:
            return AnalysisResult(metrics={"error": "undecodable"})
        vs, metrics = await screen_agent.analyze_screen(img)
        return self._finish(st, vs, metrics)

    async def browsing(self, session_id: str, entries: list[BrowsingEntry], exam_texts: list[str]) -> AnalysisResult:
        st = self._state(session_id)
        vs = await browsing_agent.analyze(entries, exam_texts)
        return self._finish(st, vs, {"entries": len(entries)})

    def risk(self, session_id: str) -> RiskResult:
        st = self._sessions.get(session_id)
        return st.risk.score() if st else RiskResult(score=0, reasons=[])

    @property
    def active(self) -> int:
        return len(self._sessions)


orchestrator = Orchestrator()
