import os

import backend.key_manager as km


def test_save_and_load_key(tmp_path, monkeypatch):
    # Use temporary directory and disable keyring for deterministic behavior
    monkeypatch.setattr(km, "keyring", None)
    monkeypatch.setattr(km, "user_data_dir", lambda *a, **k: str(tmp_path))
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    # No key exists initially
    assert km.get_api_key() is None

    # Save key and ensure file and environment variable set
    km.save_api_key("secret")
    key_file = tmp_path / "openai_key.txt"
    assert key_file.read_text() == "secret"
    assert os.environ["OPENAI_API_KEY"] == "secret"

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
        }
    ]

    # Remove env var to force reading from file
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert km.get_api_key() == "secret"

    updated_summary = km.list_key_metadata()[0]
    assert updated_summary["service"] == "openai"
    assert updated_summary["keyMasked"] == "**cret"
    assert updated_summary["lastUsed"] is not None
