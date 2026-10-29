"""Screen-frame analysis. With an LLM key, a vision model classifies the screenshot for AI chat
interfaces, messaging apps and second-device content. Without one only cheap image statistics run."""
from __future__ import annotations

import cv2
import numpy as np

from llm import complete_json
from schemas import Violation

SYSTEM = (
    "You review screenshots from a proctored online exam. Reply with JSON only: "
    '{"ai_chat": bool, "messaging": bool, "second_device": bool, "remote_tool": bool, "evidence": "short reason"}. '
    "ai_chat: an AI assistant (ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek or similar) is visible. "
    "messaging: WhatsApp, Telegram, Discord, Slack, Teams chat or similar. second_device: a phone or tablet screen "
    "is being mirrored or photographed. remote_tool: AnyDesk, TeamViewer or another remote-control window. "
    "The exam app itself (questions, a timer, an exam browser) is normal."
)


def _jpeg_b64(img: np.ndarray) -> str:
    import base64

    small = cv2.resize(img, (960, int(img.shape[0] * 960 / img.shape[1]))) if img.shape[1] > 960 else img
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(buf.tobytes()).decode() if ok else ""


async def analyze_screen(img: np.ndarray) -> tuple[list[Violation], dict[str, float | int | str | bool | None]]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    metrics: dict[str, float | int | str | bool | None] = {"mean": round(float(gray.mean()), 1), "llm": False}
    verdict = await complete_json(SYSTEM, "Classify this exam-time screenshot.", _jpeg_b64(img), max_tokens=200)
    if verdict is None:
        return [], metrics
    metrics["llm"] = True
    reason = str(verdict.get("evidence", ""))[:200]
    out: list[Violation] = []
    if verdict.get("ai_chat"):
        out.append(Violation(code="AI_SITE_OPENED", severity="HIGH", confidence=0.8, message=f"Screen shows an AI assistant: {reason}"))
    if verdict.get("remote_tool"):
        out.append(Violation(code="REMOTE_DESKTOP", severity="CRITICAL", confidence=0.75, message=f"Screen shows a remote-control tool: {reason}"))
    if verdict.get("messaging"):
        out.append(Violation(code="BLACKLISTED_APP", severity="HIGH", confidence=0.75, message=f"Screen shows a messaging app: {reason}"))
    if verdict.get("second_device"):
        out.append(Violation(code="SCREEN_MIRRORING", severity="HIGH", confidence=0.7, message=f"Screen shows second-device content: {reason}"))
    return out, metrics
