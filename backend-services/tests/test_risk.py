"""Rolling risk score: weights, the confidence floor, the 100 cap, time decay and reasons."""
from __future__ import annotations

import pytest

from agents import risk_agent
from agents.risk_agent import WEIGHTS, RiskState
from config import settings
from schemas import Violation


def violation(severity: str = "HIGH", confidence: float = 1.0, code: str = "PHONE_DETECTED", message: str = "phone in view") -> Violation:
    return Violation(code=code, severity=severity, confidence=confidence, message=message)


@pytest.fixture
def clock(monkeypatch):
    """A controllable monotonic clock for the risk agent."""
    now = [1000.0]
    monkeypatch.setattr(risk_agent.time, "monotonic", lambda: now[0])
    return now


def test_empty_state_scores_zero(clock):
    result = RiskState().score()
    assert result.score == 0
    assert result.reasons == []


@pytest.mark.parametrize("severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"])
def test_points_are_weight_times_confidence(clock, severity):
    st = RiskState()
    assert st.add(violation(severity, 0.5)) == pytest.approx(WEIGHTS[severity] * 0.5)


def test_low_confidence_is_floored_at_0_3(clock):
    assert RiskState().add(violation("HIGH", 0.1)) == pytest.approx(WEIGHTS["HIGH"] * 0.3)


def test_score_is_capped_at_100(clock):
    st = RiskState()
    for _ in range(5):
        st.add(violation("CRITICAL"))
    assert st.score().score == 100


def test_points_halve_after_one_half_life(clock):
    st = RiskState()
    st.add(violation("HIGH"))
    assert st.score().score == pytest.approx(WEIGHTS["HIGH"], abs=0.1)
    clock[0] += settings.risk_half_life_sec
    assert st.score().score == pytest.approx(WEIGHTS["HIGH"] / 2, abs=0.1)


def test_reasons_are_strongest_first_and_drop_faded_events(clock):
    st = RiskState()
    st.add(violation("LOW", code="GAZE_AWAY", message="looked away"))
    clock[0] += settings.risk_half_life_sec * 3  # LOW: 3 points -> 0.375, below the 1-point cut-off
    st.add(violation("MEDIUM", code="MULTIPLE_FACES", message="two faces"))
    st.add(violation("CRITICAL", code="PHONE_DETECTED", message="phone in view"))
    reasons = st.score().reasons
    assert reasons == ["phone detected: phone in view", "multiple faces: two faces"]


def test_at_most_five_reasons(clock):
    st = RiskState()
    for i in range(8):
        st.add(violation("LOW", message=f"event {i}"))
    assert len(st.score().reasons) == 5


def test_keeps_only_the_last_200_events(clock):
    st = RiskState()
    for _ in range(250):
        st.add(violation("LOW"))
    assert len(st.events) == 200
