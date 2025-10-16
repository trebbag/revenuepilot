"""Audio gating tests for :mod:`backend.ai_gating`."""

from __future__ import annotations

import math
from typing import Any, Dict

import pytest

from prometheus_client import REGISTRY
from backend.ai_gating import (
    AUDIO_AUTO_ROUTE,
    AUDIO_SALIENCE_SCORE_MIN,
    _parse_audio_override_rules,
)
from backend.db.models import AINoteState
from backend.migrations import session_scope
from backend.dcsb_features import compute_dcb

pytest_plugins = ["tests.test_ai_gating"]


def _ensure_state(conn, note_id: str, clinician_id: int) -> None:
    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        if state is None:
            state = AINoteState(
                note_id=note_id,
                clinician_id=clinician_id,
                last_note_snapshot="",
            )
        else:
            state.clinician_id = clinician_id
        state.cold_start_completed = True
        session.add(state)


def _metric_value(name: str, labels: Dict[str, str]) -> float:
    value = REGISTRY.get_sample_value(name, labels)
    return 0.0 if value is None else float(value)


def test_audio_gate_allows_on_critical_override(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-critical"
    _ensure_state(conn, note_id, clinician_id)

    segment = {
        "text": "Patient is short of breath.",
        "tokens": [{"confidence": 0.92}, {"confidence": 0.94}],
        "cursor": "cursor-critical",
        "vitals": {"spo2": 86},
        "accepted_json": {"type": "alert", "metric": "spo2", "value": 86},
    }
    diar = {"speaker": "clinician"}
    focus_set: Dict[str, Any] = {}

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is True
    assert detail["criticalOverride"] == "spo2<90"
    assert detail["reason"] is None
    assert pytest.approx(detail["medianConfidence"], rel=1e-6) == 0.93

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-critical"
        assert state.last_accepted_json_hash is not None


def test_audio_gate_allows_on_bp_tuple_override(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-critical-bp"
    _ensure_state(conn, note_id, clinician_id)

    segment = {
        "text": "Blood pressure remains elevated.",
        "tokens": [{"confidence": 0.91}, {"confidence": 0.92}],
        "cursor": "cursor-critical-bp",
        "vitals": {"sbp": 184, "dbp": 122},
    }
    diar = {"speaker": "clinician"}
    focus_set: Dict[str, float] = {}

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is True
    assert detail["criticalOverride"] == "bp>=180/120"

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-critical-bp"


def test_audio_gate_allows_on_troponin_override_with_synonym(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-critical-troponin"
    _ensure_state(conn, note_id, clinician_id)

    segment = {
        "text": "Reviewed lab results.",
        "tokens": [{"confidence": 0.9}, {"confidence": 0.91}],
        "cursor": "cursor-critical-trop",
    }
    diar = {"speaker": "clinician", "troponin_i": "0.12"}
    focus_set: Dict[str, float] = {}

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is True
    assert detail["criticalOverride"] == "troponin>0"

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-critical-trop"


def test_audio_gate_scores_medication_plan(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-plan-med"
    _ensure_state(conn, note_id, clinician_id)

    segment = {
        "text": "Start amoxicillin 500 mg TID.",
        "tokens": [{"confidence": 0.93}, {"confidence": 0.96}, {"confidence": 0.94}],
        "cursor": "cursor-plan",
        "entities": [{"type": "medication", "confidence": 0.95}],
        "medical_density": 0.7,
        "section": "plan",
    }
    diar = {"speaker": "clinician", "section": "plan"}
    differential_features = {
        "dx-otitis": {
            "dx": {"id": "dx-otitis", "name": "Acute otitis"},
            "kbVersion": "2024.1",
            "features": {
                "major": ["amoxicillin"],
            },
        }
    }
    focus_set = {
        "entity_weights": {"medication": 0.7},
        "speaker_multipliers": {"clinician": 1.1},
        "plan_bonus": 0.15,
        "medical_density_bonus": 0.1,
        "medical_density_threshold": 0.3,
        "differential_features": differential_features,
        "dcb": 0.9,

    }

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is True
    assert detail["score"] >= AUDIO_SALIENCE_SCORE_MIN
    assert detail["components"].get("plan", 0.0) == pytest.approx(0.15)
    assert detail["components"].get("entities", 0.0) == pytest.approx(0.7 * 0.95 * 1.1)
    assert detail["components"].get("medical_density", 0.0) == pytest.approx(0.1)
    expected_dcb = compute_dcb(segment["text"], diar["speaker"], differential_features)
    assert detail["dcb"] == pytest.approx(expected_dcb)

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-plan"


def test_audio_gate_hint_and_repetition_bonus(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-pe-repeat"
    _ensure_state(conn, note_id, clinician_id)

    route = AUDIO_AUTO_ROUTE
    blocked_reason = {"route": route, "decision": "blocked", "reason": "NOT_MEANINGFUL"}
    allowed_reason = {"route": route, "decision": "allowed", "reason": "allowed"}
    ascore_count = {"route": route}
    dcb_count = {"route": route}
    confidence_count = {"route": route}

    blocked_before = _metric_value("revenuepilot_ai_audio_decisions_total", blocked_reason)
    allowed_before = _metric_value("revenuepilot_ai_audio_decisions_total", allowed_reason)
    ascore_before = _metric_value("revenuepilot_ai_audio_ascore_count", ascore_count)
    dcb_before = _metric_value("revenuepilot_ai_audio_dcb_count", dcb_count)
    confidence_before = _metric_value("revenuepilot_ai_audio_asr_confidence_count", confidence_count)

    segment = {
        "text": "Physical exam reveals diffuse wheezing.",
        "tokens": [{"confidence": 0.91}, {"confidence": 0.9}, {"confidence": 0.92}],
        "cursor": "cursor-pe",
        "entities": [{"type": "exam", "confidence": 0.9}],
        "medical_density": 0.4,
        "section": "pe",
    }
    diar_first = {"speaker": "clinician", "section": "pe", "repetitions": 0}
    differential_features = {
        "dx-asthma": {
            "dx": {"id": "dx-asthma", "name": "Asthma"},
            "kbVersion": "2024.1",
            "features": {
                "minor": ["wheezing"],
            },
            "speakerMultiplier": 1.0,
        }
    }
    focus_set = {
        "entity_weights": {"exam": 0.4},
        "speaker_multipliers": {"clinician": 1.0},
        "repetition_bonus": 0.05,
        "repetition_cap": 3,
        "medical_density_bonus": 0.08,
        "medical_density_threshold": 0.3,
        "differential_features": differential_features,
        "dcb": 1.15,
    }

    allowed_first, detail_first = service.should_allow_audio_auto(
        note_id, clinician_id, segment, diar_first, focus_set
    )
    assert allowed_first is False
    assert detail_first["reason"] == "LOW_SALIENCE"
    assert detail_first["hint"] is True
    expected_dcb_first = compute_dcb(segment["text"], diar_first["speaker"], differential_features)
    assert pytest.approx(detail_first["dcb"], rel=1e-6) == expected_dcb_first
    assert math.isclose(
        AUDIO_SALIENCE_SCORE_MIN - detail_first["score"],
        0.01,
        rel_tol=0.0,
        abs_tol=0.02,
    )

    diar_second = {"speaker": "clinician", "section": "pe", "repetitions": 2}
    allowed_second, detail_second = service.should_allow_audio_auto(
        note_id, clinician_id, segment, diar_second, focus_set
    )
    assert allowed_second is True
    assert detail_second["components"].get("repetition", 0.0) == pytest.approx(0.1)
    assert detail_second["score"] >= AUDIO_SALIENCE_SCORE_MIN
    assert detail_second["hint"] is False

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-pe"


def test_audio_gate_blocks_conversational_repeat(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-smalltalk"
    _ensure_state(conn, note_id, clinician_id)


    def metric(name: str, labels: Dict[str, str]) -> float:
        value = REGISTRY.get_sample_value(name, labels)
        return 0.0 if value is None else float(value)

    route = AUDIO_AUTO_ROUTE
    blocked_reason = {"route": route, "decision": "blocked", "reason": "NOT_MEANINGFUL"}
    allowed_reason = {"route": route, "decision": "allowed", "reason": "allowed"}
    ascore_count = {"route": route}
    dcb_count = {"route": route}
    confidence_count = {"route": route}

    blocked_before = metric("revenuepilot_ai_audio_decisions_total", blocked_reason)
    allowed_before = metric("revenuepilot_ai_audio_decisions_total", allowed_reason)
    ascore_before = metric("revenuepilot_ai_audio_ascore_count", ascore_count)
    dcb_before = metric("revenuepilot_ai_audio_dcb_count", dcb_count)
    confidence_before = metric("revenuepilot_ai_audio_asr_confidence_count", confidence_count)


    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        state.last_transcript_cursor = "How have you been feeling lately?"
        session.add(state)

    segment = {
        "text": "How have you been feeling lately?",
        "tokens": [{"confidence": 0.91}, {"confidence": 0.92}],
    }
    diar = {"speaker": "patient"}
    focus_set: Dict[str, Any] = {}

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is False
    assert detail["reason"] == "NOT_MEANINGFUL"
    assert detail["hint"] is False

    assert _metric_value("revenuepilot_ai_audio_decisions_total", blocked_reason) == pytest.approx(blocked_before + 1.0)
    assert _metric_value("revenuepilot_ai_audio_decisions_total", allowed_reason) == pytest.approx(allowed_before)
    assert _metric_value("revenuepilot_ai_audio_ascore_count", ascore_count) == pytest.approx(ascore_before)
    assert _metric_value("revenuepilot_ai_audio_dcb_count", dcb_count) == pytest.approx(dcb_before)
    assert _metric_value("revenuepilot_ai_audio_asr_confidence_count", confidence_count) == pytest.approx(confidence_before + 1.0)


def test_audio_gate_blocks_conversational_diet_chat(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-diet-chat"
    _ensure_state(conn, note_id, clinician_id)

    conversational = "…we chatted about diet and walking."
    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        state.last_transcript_cursor = conversational
        session.add(state)

    segment = {
        "text": conversational,
        "tokens": [{"confidence": 0.92}, {"confidence": 0.9}],
    }
    diar = {"speaker": "patient"}
    focus_set: Dict[str, float] = {}

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is False
    assert detail["reason"] == "NOT_MEANINGFUL"
    assert detail["criticalOverride"] is None


def test_audio_gate_critical_override_hypertensive_troponin(
    monkeypatch, gating_service_state
) -> None:
    conn, service, clinician_id = gating_service_state
    monkeypatch.setattr(
        "backend.ai_gating.AUDIO_CRITICAL_OVERRIDES",
        _parse_audio_override_rules("bp>=180/120,troponin_abnormal>0"),
    )

    note_id = "audio-hypertensive"
    _ensure_state(conn, note_id, clinician_id)

    segment = {
        "text": "Discussed severe hypertension and abnormal troponin.",
        "tokens": [{"confidence": 0.94}, {"confidence": 0.96}],
        "cursor": "cursor-hbp",
        "vitals": {"bp": "182/124", "troponin_abnormal": 1},
    }
    diar = {"speaker": "clinician"}
    focus_set: Dict[str, float] = {}

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is True
    assert detail["criticalOverride"] == "bp>=180/120"
    assert detail["reason"] is None

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-hbp"

