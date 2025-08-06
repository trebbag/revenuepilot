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

    # Remove env var to force reading from file
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert km.get_api_key() == "secret"
