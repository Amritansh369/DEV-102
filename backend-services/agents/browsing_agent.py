"""Browsing analysis: detects exam-question text pasted into searches (fuzzy token and sequence
matching against the exam's questions) and, with an LLM key, classifies ambiguous queries."""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from config import settings
from llm import complete_json
from schemas import BrowsingEntry, Violation

_WORD = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "of", "is", "in", "to", "and", "or", "for", "what", "which", "with", "on", "by", "be", "are", "its", "this", "that"}
_PROMPTY = re.compile(r"\b(solve|answer|explain|give (me )?(the )?answer|which option|correct option|mcq|step by step|options?:)\b", re.I)


def _tokens(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower().replace("**", "")) if w not in _STOP and len(w) > 1}


def best_match(query: str, exam_texts: list[str]) -> tuple[float, str]:
    q_tokens = _tokens(query)
    if len(q_tokens) < 3:
        return 0.0, ""
    best, text_hit = 0.0, ""
    for text in exam_texts:
        t_tokens = _tokens(text)
        if not t_tokens:
            continue
        overlap = len(q_tokens & t_tokens) / min(len(q_tokens), len(t_tokens))
        seq = SequenceMatcher(None, query.lower(), text.lower()).ratio()
        score = max(overlap * 0.9, seq)
        if score > best:
            best, text_hit = score, text
    return best, text_hit


async def analyze(entries: list[BrowsingEntry], exam_texts: list[str]) -> list[Violation]:
    out: list[Violation] = []
    for e in entries:
        if not e.query:
            continue
        score, hit = best_match(e.query, exam_texts)
        if score >= settings.query_similarity:
            out.append(Violation(
                code="AI_QUERY_DETECTED", severity="HIGH", confidence=round(min(1.0, score), 3),
                message=f'Searched text matching an exam question ({score:.0%} similar): "{e.query[:120]}" ~ "{hit[:80]}"',
            ))
        elif _PROMPTY.search(e.query):
            verdict = await complete_json(
                "You flag exam cheating. Reply JSON only: {\"cheating\": bool, \"reason\": \"short\"}. "
                "cheating is true when the search asks for an answer to a test question rather than general reference.",
                f"Search query typed during an exam: {e.query[:400]}", max_tokens=120,
            )
            if verdict and verdict.get("cheating"):
                out.append(Violation(code="AI_QUERY_DETECTED", severity="HIGH", confidence=0.65, message=f'Answer-seeking query: "{e.query[:120]}" ({str(verdict.get("reason", ""))[:80]})'))
    return out
