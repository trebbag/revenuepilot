import os
import stat
import json
from pathlib import Path
from typing import Optional, Dict

try:
    import keyring
    from keyring.errors import KeyringError
except Exception:  # pragma: no cover - keyring may not be installed
    keyring = None

    class KeyringError(Exception):
        """Fallback error when keyring is unavailable."""
        pass

from platformdirs import user_data_dir

from cryptography.fernet import Fernet

APP_NAME = "RevenuePilot"
SERVICE_NAME = "revenuepilot-openai"


def _base_dir() -> Path:
    directory = Path(user_data_dir(APP_NAME, APP_NAME))
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _key_file() -> Path:
    return _base_dir() / "keys.json.enc"


def _fernet_file() -> Path:
    return _base_dir() / "keys.key"


def _legacy_file() -> Path:
    return _base_dir() / "openai_key.txt"


def _fernet() -> Fernet:  # pragma: no cover - simple helper
    f_path = _fernet_file()
    if f_path.exists():
        key = f_path.read_bytes()
    else:
        key = Fernet.generate_key()
        f_path.write_bytes(key)
    return Fernet(key)


def _load_all_keys() -> Dict[str, str]:  # pragma: no cover - simple IO
    k_path = _key_file()
    if not k_path.exists():
        return {}
    f = _fernet()
    try:
        decrypted = f.decrypt(k_path.read_bytes()).decode()
        return json.loads(decrypted)
    except Exception:
        return {}


def _save_all_keys(data: Dict[str, str]) -> None:  # pragma: no cover - simple IO
    f = _fernet()
    _key_file().write_bytes(f.encrypt(json.dumps(data).encode()))


def get_all_keys() -> Dict[str, str]:  # pragma: no cover - thin wrapper
    """Return all stored keys as a dictionary."""
    return _load_all_keys()


def store_key(name: str, key: str) -> None:  # pragma: no cover - thin wrapper
    """Store a named API key in encrypted storage."""
    data = _load_all_keys()
    data[name] = key
    _save_all_keys(data)


def get_api_key() -> Optional[str]:
    """Load the OpenAI API key from env, keyring, or encrypted file."""
    key = os.getenv("OPENAI_API_KEY")
    if key:
        return key
    if keyring:
        try:
            key = keyring.get_password(SERVICE_NAME, "api_key")
        except KeyringError:
            key = None
        if key:
            os.environ["OPENAI_API_KEY"] = key
            return key
    key = _load_all_keys().get("openai")
    if key:
        os.environ["OPENAI_API_KEY"] = key
        return key
    legacy = _legacy_file()
    if legacy.exists():
        try:
            key = legacy.read_text(encoding="utf-8").strip()
            if key:
                os.environ["OPENAI_API_KEY"] = key
                return key
        except OSError:
            pass
    return None


def save_api_key(key: str) -> None:
    """Persist the API key to keyring or encrypted file."""
    if keyring:
        try:
            keyring.set_password(SERVICE_NAME, "api_key", key)
            os.environ["OPENAI_API_KEY"] = key
            return
        except KeyringError:
            pass
    store_key("openai", key)
    legacy = _legacy_file()
    try:
        legacy.write_text(key, encoding="utf-8")
        if os.name == "nt":
            os.chmod(legacy, stat.S_IREAD | stat.S_IWRITE)
        else:
            os.chmod(legacy, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    os.environ["OPENAI_API_KEY"] = key
