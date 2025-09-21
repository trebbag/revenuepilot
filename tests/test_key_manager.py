import json
import os
from datetime import datetime, timezone, timedelta

import pytest

import backend.key_manager as km


def test_save_and_load_key(tmp_path, monkeypatch):
    # Use temporary directory and disable keyring for deterministic behavior
    monkeypatch.setattr(km, "keyring", None)
    monkeypatch.setattr(km, "user_data_dir", lambda *a, **k: str(tmp_path))
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY_ROTATED_AT", raising=False)

    # No key exists initially
    assert km.get_api_key() is None

    # Save key and ensure file and environment variable set
    km.save_api_key("secret")
    key_file = tmp_path / "openai_key.txt"
    assert key_file.read_text() == "secret"
    assert os.environ["OPENAI_API_KEY"] == "secret"

    metadata_path = tmp_path / "secrets_metadata.json"
    metadata = json.loads(metadata_path.read_text())
    assert metadata["openai"]["source"] == "local-file"
    assert metadata["openai"]["rotatedAt"]

    stored = km.get_all_keys()
    assert "openai" in stored
    openai_entry = stored["openai"]
    assert openai_entry["status"] == "active"
    assert openai_entry["lastUsed"] is None
    assert openai_entry["ciphertext"] and openai_entry["ciphertext"] != "secret"

    summaries = km.list_key_metadata()
    assert summaries == [
        {
            "service": "openai",
            "keyMasked": "**cret",
            "status": "active",
            "lastUsed": None,
            "encrypted": True,
            "rotatedAt": metadata["openai"]["rotatedAt"],
            "version": metadata["openai"]["version"],
            "source": "local-file",
            "expiresAt": metadata["openai"].get("expiresAt"),
        }
    ]

    # Remove env var to force reading from file
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert km.get_api_key() == "secret"

    updated_summary = km.list_key_metadata()[0]
    assert updated_summary["service"] == "openai"
    assert updated_summary["keyMasked"] == "**cret"
    assert updated_summary["lastUsed"] is not None
    refreshed_metadata = json.loads(metadata_path.read_text())
    assert refreshed_metadata["openai"]["lastUsed"] == updated_summary["lastUsed"]


def test_require_secret_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(km, "user_data_dir", lambda *a, **k: str(tmp_path))
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("JWT_SECRET_ROTATED_AT", raising=False)
    with pytest.raises(km.SecretNotFoundError):
        km.require_secret("jwt", "JWT_SECRET", allow_fallback=False)


def test_secret_rotation_stale(tmp_path, monkeypatch):
    monkeypatch.setattr(km, "keyring", None)
    monkeypatch.setattr(km, "user_data_dir", lambda *a, **k: str(tmp_path))
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY_ROTATED_AT", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")

    km.store_secret("openai", "OPENAI_API_KEY", "secret")
    metadata_path = tmp_path / "secrets_metadata.json"
    data = json.loads(metadata_path.read_text())
    data["openai"]["rotatedAt"] = (
        datetime.now(timezone.utc) - timedelta(days=200)
    ).isoformat()
    metadata_path.write_text(json.dumps(data))
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(km.SecretRotationError):
        km.get_api_key()
