"""Provider-agnostic LLM wrapper returning structured JSON. Defaults to the Anthropic Messages API;
set LLM_BASE_URL to an OpenAI-compatible endpoint to use another provider. Disabled without LLM_API_KEY."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

import httpx

from config import settings

log = logging.getLogger("agent.llm")

_client: httpx.AsyncClient | None = None
# Per-process token budget per minute, so a burst of screen frames cannot run up the bill.
_budget = {"window": 0.0, "used": 0}
BUDGET_PER_MIN = 40_000


def _http() -> httpx.AsyncClient:
    global _client
    _client = _client or httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0))
    return _client


def _spend(tokens: int) -> bool:
    now = time.monotonic()
    if now - _budget["window"] > 60:
        _budget.update(window=now, used=0)
    if _budget["used"] + tokens > BUDGET_PER_MIN:
        return False
    _budget["used"] += tokens
    return True


def _extract_json(text: str) -> dict[str, Any] | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        out = json.loads(m.group(0))
        return out if isinstance(out, dict) else None
    except json.JSONDecodeError:
        return None


async def complete_json(system: str, prompt: str, image_b64: str | None = None, max_tokens: int = 400) -> dict[str, Any] | None:
    """Returns the model's JSON object, or None when disabled, over budget or failing after retries."""
    if not settings.llm_enabled or not _spend(max_tokens + (1500 if image_b64 else 300)):
        return None
    openai_style = "anthropic" not in settings.llm_base_url
    if openai_style:
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        if image_b64:
            content.insert(0, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}})
        url = f"{settings.llm_base_url.rstrip('/')}/v1/chat/completions"
        body: dict[str, Any] = {"model": settings.llm_model, "max_tokens": max_tokens, "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
        headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
    else:
        content = [{"type": "text", "text": prompt}]
        if image_b64:
            content.insert(0, {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}})
        url = f"{settings.llm_base_url.rstrip('/')}/v1/messages"
        body = {"model": settings.llm_model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": content}]}
        headers = {"x-api-key": settings.llm_api_key, "anthropic-version": "2023-06-01"}

    for attempt in range(3):
        try:
            r = await _http().post(url, json=body, headers=headers)
            if r.status_code in (429, 500, 502, 503, 529):
                await asyncio.sleep(0.6 * 2**attempt)
                continue
            r.raise_for_status()
            data = r.json()
            text = data["choices"][0]["message"]["content"] if openai_style else "".join(b.get("text", "") for b in data.get("content", []))
            return _extract_json(text)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            log.warning("llm call failed (attempt %d): %s", attempt + 1, exc)
            await asyncio.sleep(0.6 * 2**attempt)
    return None
