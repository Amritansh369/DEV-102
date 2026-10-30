"""Request and response models. Codes and severities match the API contract exactly."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ViolationCode = Literal[
    "MULTIPLE_FACES", "NO_FACE", "GAZE_AWAY", "FACE_MISMATCH", "AI_SITE_OPENED", "AI_QUERY_DETECTED",
    "BLACKLISTED_APP", "SCREEN_MIRRORING", "MULTI_MONITOR", "VM_DETECTED", "REMOTE_DESKTOP", "EXTERNAL_DEVICE",
    "CLIPBOARD_USE", "SHORTCUT_BLOCKED", "SCREEN_SHARE_STOPPED", "CAMERA_BLOCKED", "MULTI_LOGIN", "NETWORK_LOST", "WINDOW_BLUR",
    "VOICE_DETECTED", "MIC_BLOCKED", "PHONE_DETECTED", "NOTES_DETECTED",
]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

MAX_IMAGE_B64 = 4_000_000


class Violation(BaseModel):
    code: ViolationCode
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    message: str


class AnalysisResult(BaseModel):
    violations: list[Violation] = []
    metrics: dict[str, float | int | str | bool | None] = {}
    riskDelta: float = 0


class FrameRequest(BaseModel):
    sessionId: str = Field(min_length=1, max_length=64)
    imageBase64: str = Field(min_length=100, max_length=MAX_IMAGE_B64)
    ts: str | None = None
    registeredFaceBase64: str | None = Field(default=None, max_length=MAX_IMAGE_B64)


class ScreenRequest(BaseModel):
    sessionId: str = Field(min_length=1, max_length=64)
    imageBase64: str = Field(min_length=100, max_length=MAX_IMAGE_B64)
    ts: str | None = None


class BrowsingEntry(BaseModel):
    url: str = Field(max_length=2000)
    title: str = Field(default="", max_length=300)
    query: str | None = Field(default=None, max_length=2000)
    at: str | None = None


class BrowsingRequest(BaseModel):
    sessionId: str = Field(min_length=1, max_length=64)
    entries: list[BrowsingEntry] = Field(max_length=100)
    examTexts: list[str] = Field(default=[], max_length=2000)


class FaceVerifyRequest(BaseModel):
    imageBase64: str = Field(min_length=100, max_length=MAX_IMAGE_B64)
    registeredBase64: str | None = Field(default=None, max_length=MAX_IMAGE_B64)


class FaceVerifyResult(BaseModel):
    match: bool
    similarity: float
    faces: int
    liveness: bool
    eyesOpen: bool | None = None


class RiskResult(BaseModel):
    score: float
    reasons: list[str]
