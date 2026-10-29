"""Explainable rolling risk score: each flag adds severity × confidence points that decay with a
configurable half-life, and every contribution keeps a one-line reason."""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

from config import settings
from schemas import RiskResult, Violation

WEIGHTS = {"LOW": 3.0, "MEDIUM": 8.0, "HIGH": 18.0, "CRITICAL": 40.0}


@dataclass
class RiskState:
    events: list[tuple[float, float, str]] = field(default_factory=list)  # (monotonic time, points, reason)

    def add(self, v: Violation) -> float:
        points = WEIGHTS[v.severity] * max(0.3, v.confidence)
        self.events.append((time.monotonic(), points, f"{v.code.replace('_', ' ').lower()}: {v.message}"))
        self.events = self.events[-200:]
        return points

    def score(self) -> RiskResult:
        now = time.monotonic()
        decay = math.log(2) / settings.risk_half_life_sec
        live = [(p * math.exp(-decay * (now - t)), r) for t, p, r in self.events]
        total = min(100.0, sum(p for p, _ in live))
        reasons = [r for p, r in sorted(live, key=lambda x: -x[0]) if p >= 1][:5]
        return RiskResult(score=round(total, 1), reasons=reasons)
