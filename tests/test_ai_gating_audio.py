"""Audio gating tests for :mod:`backend.ai_gating`."""

from __future__ import annotations

import math
from typing import Dict

from backend.ai_gating import AUDIO_SALIENCE_SCORE_MIN
from backend.db.models import AINoteState
from backend.migrations import session_scope

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
    focus_set: Dict[str, float] = {}

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is True
    assert detail["criticalOverride"] == "spo2<90"
    assert detail["reason"] is None

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-critical"
        assert state.last_accepted_json_hash is not None


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
    focus_set = {
        "entity_weights": {"medication": 0.7},
        "speaker_multipliers": {"clinician": 1.1},
        "plan_bonus": 0.15,
        "medical_density_bonus": 0.1,
        "medical_density_threshold": 0.3,
        "dcb": 0.25,
    }

    allowed, detail = service.should_allow_audio_auto(note_id, clinician_id, segment, diar, focus_set)
    assert allowed is True
    assert detail["score"] >= AUDIO_SALIENCE_SCORE_MIN
    assert detail["components"].get("plan", 0.0) > 0.0
    assert detail["components"].get("entities", 0.0) > 0.0

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-plan"


def test_audio_gate_hint_and_repetition_bonus(gating_service_state) -> None:
    conn, service, clinician_id = gating_service_state
    note_id = "audio-pe-repeat"
    _ensure_state(conn, note_id, clinician_id)

    segment = {
        "text": "Physical exam reveals diffuse wheezing.",
        "tokens": [{"confidence": 0.91}, {"confidence": 0.9}, {"confidence": 0.92}],
        "cursor": "cursor-pe",
        "entities": [{"type": "exam", "confidence": 0.9}],
        "medical_density": 0.4,
        "section": "pe",
    }
    diar_first = {"speaker": "clinician", "section": "pe", "repetitions": 0}
    focus_set = {
        "entity_weights": {"exam": 0.4},
        "speaker_multipliers": {"clinician": 1.0},
        "repetition_bonus": 0.05,
        "repetition_cap": 3,
        "medical_density_bonus": 0.08,
        "medical_density_threshold": 0.3,
        "dcb": 0.3,
    }

    allowed_first, detail_first = service.should_allow_audio_auto(
        note_id, clinician_id, segment, diar_first, focus_set
    )
    assert allowed_first is False
    assert detail_first["reason"] == "LOW_SALIENCE"
    assert detail_first["hint"] is True
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
    assert detail_second["components"].get("repetition", 0.0) >= 0.1
    assert detail_second["score"] >= AUDIO_SALIENCE_SCORE_MIN
    assert detail_second["hint"] is False

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-pe"
