"""Question-text matching in the browsing agent and the violations it raises."""
from __future__ import annotations

import asyncio

import pytest

from agents import browsing_agent
from agents.browsing_agent import best_match
from config import settings
from schemas import BrowsingEntry

QUESTIONS = [
    "A train covers 360 km in 5 hours. What is its average speed in km/h?",
    "Which data structure gives O(1) average lookup by key?",
]


def test_exact_question_scores_highest():
    score, hit = best_match(QUESTIONS[0], QUESTIONS)
    assert score == pytest.approx(1.0)
    assert hit == QUESTIONS[0]


def test_reworded_question_still_matches():
    score, hit = best_match("train 360 km 5 hours average speed", QUESTIONS)
    assert score >= settings.query_similarity
    assert hit == QUESTIONS[0]


def test_unrelated_query_stays_below_threshold():
    score, _ = best_match("best pizza places near connaught place delhi", QUESTIONS)
    assert score < settings.query_similarity


@pytest.mark.parametrize("query", ["", "the of", "speed km"])
def test_queries_under_three_words_are_ignored(query):
    assert best_match(query, QUESTIONS) == (0.0, "")


def test_no_exam_texts():
    assert best_match("train covers 360 km in 5 hours", []) == (0.0, "")
    assert best_match("train covers 360 km in 5 hours", ["", "the of a"]) == (0.0, "")


def test_markdown_bold_is_ignored():
    plain, _ = best_match("O(1) average lookup by key data structure", QUESTIONS)
    bold, _ = best_match("**O(1)** average **lookup** by key data structure", QUESTIONS)
    assert bold == pytest.approx(plain, abs=0.05)


@pytest.fixture
def no_llm(monkeypatch):
    """Records LLM calls instead of making them; returns None like a disabled LLM."""
    calls: list[str] = []

    async def fake(_system: str, prompt: str, *args: object, **kwargs: object) -> None:
        calls.append(prompt)
        return None

    monkeypatch.setattr(browsing_agent, "complete_json", fake)
    return calls


def test_pasted_question_raises_ai_query_violation(no_llm):
    entries = [BrowsingEntry(url="https://chatgpt.com/", query=QUESTIONS[1])]
    out = asyncio.run(browsing_agent.analyze(entries, QUESTIONS))
    assert [v.code for v in out] == ["AI_QUERY_DETECTED"]
    assert out[0].severity == "HIGH"
    assert 0 < out[0].confidence <= 1
    assert no_llm == []


def test_entries_without_query_or_match_raise_nothing(no_llm):
    entries = [
        BrowsingEntry(url="https://docs.python.org/3/"),
        BrowsingEntry(url="https://www.google.com/search", query="weather in bengaluru tomorrow"),
    ]
    assert asyncio.run(browsing_agent.analyze(entries, QUESTIONS)) == []
    assert no_llm == []


def test_prompt_like_query_goes_to_llm_and_none_means_no_violation(no_llm):
    entries = [BrowsingEntry(url="https://chatgpt.com/", query="solve this step by step for me please")]
    assert asyncio.run(browsing_agent.analyze(entries, QUESTIONS)) == []
    assert len(no_llm) == 1
