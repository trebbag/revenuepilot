import base64
import json
import logging
from pathlib import Path

import pytest

from backend import main
from backend.encryption import encrypt_artifact, decrypt_artifact
from backend.security import hash_identifier


async def test_inline_chart_upload_logs_hash(monkeypatch, tmp_path: Path, caplog):
    caplog.set_level(logging.INFO)
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path)

    class DummyPipeline:
        async def handle_upload(self, **_: object) -> dict:
            return {"files": [], "correlation_id": "ctx_dummy", "patient_id": "patient-123"}

    monkeypatch.setattr(main, "context_pipeline", DummyPipeline())

    payload = main.ChartUploadPayload(
        filename="note.txt",
        data=base64.b64encode(b"payload").decode(),
        contentType="text/plain",
    )

    correlation = await main._process_inline_chart_upload("patient-123", payload)
    assert correlation

    hashed_expected = hash_identifier("patient-123")

    matched_records = []
    for record in caplog.records:
        event = getattr(record, "event", None)
        patient_hash = getattr(record, "patient_hash", None)
        parsed_payload = None

        if event != "chart_upload.saved":
            try:
                parsed_payload = json.loads(record.getMessage())
            except json.JSONDecodeError:
                parsed_payload = None
            if isinstance(parsed_payload, dict):
                event = event or parsed_payload.get("event")
                patient_hash = patient_hash or parsed_payload.get("patient_hash")

        if event == "chart_upload.saved":
            matched_records.append((record, patient_hash, parsed_payload))

    assert matched_records

    for record, patient_hash, payload in matched_records:
        assert patient_hash == hashed_expected
        message = record.getMessage()
        assert "patient-123" not in message
        if isinstance(payload, dict):
            assert payload.get("patient_hash") == hashed_expected
            assert "patient-123" not in json.dumps(payload)


def test_encrypt_artifact_roundtrip():
    plaintext = b"secret"
    ciphertext = encrypt_artifact(plaintext)
    assert ciphertext != plaintext
    assert decrypt_artifact(ciphertext) == plaintext
