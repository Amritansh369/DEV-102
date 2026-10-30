"""Provider-agnostic LLM wrapper returning structured JSON. Defaults to the Anthropic Messages API;
set LLM_BASE_URL to an OpenAI-compatible endpoint (Gemini, Hugging Face, OpenAI) to use another provider,
and LLM_FALLBACK_* for a second one. Disabled without an API key."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
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


@dataclass(frozen=True)
class Provider:
    api_key: str
    model: str
    base_url: str

    @property
    def anthropic(self) -> bool:
        return "anthropic" in self.base_url

    @property
    def url(self) -> str:
        base = self.base_url.rstrip("/")
        if self.anthropic:
            return f"{base}/v1/messages"
        # Gemini (/v1beta/openai) and Hugging Face (/v1) already carry their version in the base URL.
        return f"{base}/chat/completions" if re.search(r"/(v\d+\w*|openai)$", base) else f"{base}/v1/chat/completions"


def providers() -> list[Provider]:
    found = [Provider(settings.llm_api_key, settings.llm_model, settings.llm_base_url)]
    if settings.llm_fallback_api_key and settings.llm_fallback_base_url:
        found.append(Provider(settings.llm_fallback_api_key, settings.llm_fallback_model or settings.llm_model, settings.llm_fallback_base_url))
    return [p for p in found if p.api_key]


def _request(p: Provider, system: str, prompt: str, image_b64: str | None, max_tokens: int) -> tuple[dict[str, Any], dict[str, str]]:
    if p.anthropic:
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        if image_b64:
            content.insert(0, {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}})
        body: dict[str, Any] = {"model": p.model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": content}]}
        return body, {"x-api-key": p.api_key, "anthropic-version": "2023-06-01"}
    content = [{"type": "text", "text": prompt}]
    if image_b64:
        content.insert(0, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}})
    body = {"model": p.model, "max_tokens": max_tokens, "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
    return body, {"Authorization": f"Bearer {p.api_key}"}


async def _call(p: Provider, system: str, prompt: str, image_b64: str | None, max_tokens: int, attempts: int) -> dict[str, Any] | None:
    body, headers = _request(p, system, prompt, image_b64, max_tokens)
    for attempt in range(attempts):
        try:
            r = await _http().post(p.url, json=body, headers=headers)
            if r.status_code in (429, 500, 502, 503, 529):
                log.warning("llm %s returned %d (attempt %d)", p.base_url, r.status_code, attempt + 1)
                await asyncio.sleep(0.6 * 2**attempt)
                continue
            r.raise_for_status()
            data = r.json()
            text = "".join(b.get("text", "") for b in data.get("content", [])) if p.anthropic else data["choices"][0]["message"]["content"]
            return _extract_json(text)
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            log.warning("llm %s failed (attempt %d): %s", p.base_url, attempt + 1, exc)
            await asyncio.sleep(0.6 * 2**attempt)
    return None


async def complete_json(system: str, prompt: str, image_b64: str | None = None, max_tokens: int = 400) -> dict[str, Any] | None:
    """Returns the model's JSON object, or None when disabled, over budget or every provider fails.
    With a fallback configured, the first provider gets fewer retries so the fallback answers quickly."""
    chain = providers()
    if not chain or not _spend(max_tokens + (1500 if image_b64 else 300)):
        return None
    for i, p in enumerate(chain):
        result = await _call(p, system, prompt, image_b64, max_tokens, attempts=3 if i == len(chain) - 1 else 2)
        if result is not None:
            return result
    return None
