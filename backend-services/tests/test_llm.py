"""Provider URLs and the fallback chain in the LLM client, with the HTTP layer faked."""
from __future__ import annotations

import asyncio
import dataclasses
from typing import Any

import httpx
import pytest

import llm
from llm import Provider


@pytest.mark.parametrize(("base", "url"), [
    ("https://api.anthropic.com", "https://api.anthropic.com/v1/messages"),
    ("https://api.openai.com", "https://api.openai.com/v1/chat/completions"),
    ("https://generativelanguage.googleapis.com/v1beta/openai/", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
    ("https://router.huggingface.co/v1", "https://router.huggingface.co/v1/chat/completions"),
])
def test_each_provider_gets_its_own_endpoint(base: str, url: str) -> None:
    assert Provider("k", "m", base).url == url


class FakeClient:
    """Answers each URL with the queued responses, recording every call."""

    def __init__(self, replies: dict[str, list[httpx.Response]]) -> None:
        self.replies = replies
        self.calls: list[tuple[str, dict[str, Any], dict[str, str]]] = []

    async def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> httpx.Response:
        self.calls.append((url, json, headers))
        return self.replies[url].pop(0)


def ok(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]}, request=httpx.Request("POST", "http://x"))


def busy() -> httpx.Response:
    return httpx.Response(429, json={}, request=httpx.Request("POST", "http://x"))


GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
HF = "https://router.huggingface.co/v1/chat/completions"


@pytest.fixture
def setup(monkeypatch):
    def run(replies: dict[str, list[httpx.Response]], fallback: bool = True) -> FakeClient:
        s = dataclasses.replace(
            llm.settings, llm_api_key="gem-key", llm_model="gemini-flash", llm_base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            llm_fallback_api_key="hf-key" if fallback else "", llm_fallback_model="qwen-vl", llm_fallback_base_url="https://router.huggingface.co/v1",
        )
        monkeypatch.setattr(llm, "settings", s)
        monkeypatch.setattr(llm, "_budget", {"window": 0.0, "used": 0})
        client = FakeClient(replies)
        monkeypatch.setattr(llm, "_http", lambda: client)

        async def no_wait(_s: float) -> None:
            return None
        monkeypatch.setattr(llm.asyncio, "sleep", no_wait)
        return client
    return run


def test_the_first_provider_answers_with_its_own_key_and_model(setup) -> None:
    client = setup({GEMINI: [ok('{"label": "ok"}')]})
    assert asyncio.run(llm.complete_json("sys", "hi")) == {"label": "ok"}
    url, body, headers = client.calls[0]
    assert (url, body["model"], headers["Authorization"]) == (GEMINI, "gemini-flash", "Bearer gem-key")


def test_a_rate_limited_first_provider_falls_back_to_the_second(setup) -> None:
    client = setup({GEMINI: [busy(), busy()], HF: [ok('{"label": "ai"}')]})
    assert asyncio.run(llm.complete_json("sys", "hi", image_b64="abc")) == {"label": "ai"}
    assert [c[0] for c in client.calls] == [GEMINI, GEMINI, HF]
    assert client.calls[2][1]["model"] == "qwen-vl"
    assert client.calls[2][1]["messages"][1]["content"][0]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_without_a_fallback_the_only_provider_gets_three_tries(setup) -> None:
    client = setup({GEMINI: [busy(), busy(), busy()]}, fallback=False)
    assert asyncio.run(llm.complete_json("sys", "hi")) is None
    assert len(client.calls) == 3


def test_a_reply_without_json_counts_as_no_answer(setup) -> None:
    setup({GEMINI: [ok("I cannot help with that.")], HF: [ok("still no json")]})
    assert asyncio.run(llm.complete_json("sys", "hi")) is None
