import os
import stat
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

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

DEFAULT_STATUS = "active"


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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _encrypt_value(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt_value(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")


def _mask_key(value: str) -> str:
    if not value:
        return ""
    visible = 4
    if len(value) <= visible:
        return "*" * len(value)
    return "*" * (len(value) - visible) + value[-visible:]


def _normalize_entry(value: Any) -> Tuple[Optional[Dict[str, Any]], bool]:
    changed = False

    if isinstance(value, str):
        return (
            {
                "ciphertext": _encrypt_value(value),
                "status": DEFAULT_STATUS,
                "lastUsed": None,
            },
            True,
        )

    if not isinstance(value, dict):
        return None, False

    entry: Dict[str, Any] = {
        "ciphertext": value.get("ciphertext"),
        "status": value.get("status", DEFAULT_STATUS),
        "lastUsed": value.get("lastUsed"),
    }

    # Accept legacy structures that may have used different keys.
    if not entry["ciphertext"]:
        legacy_value = value.get("value") or value.get("key")
        if isinstance(legacy_value, str) and legacy_value:
            entry["ciphertext"] = _encrypt_value(legacy_value)
            changed = True
        else:
            return None, False

    if entry["status"] in (None, ""):
        entry["status"] = DEFAULT_STATUS
        changed = True

    last_used = entry.get("lastUsed")
    if last_used is not None and not isinstance(last_used, str):
        entry["lastUsed"] = str(last_used)
        changed = True

    return entry, changed


def _load_all_keys() -> Dict[str, Dict[str, Any]]:  # pragma: no cover - simple IO
    k_path = _key_file()
    if not k_path.exists():
        return {}
    f = _fernet()
    try:
        decrypted = f.decrypt(k_path.read_bytes()).decode()
        data = json.loads(decrypted)
    except Exception:
        return {}

    if not isinstance(data, dict):
        return {}

    normalized: Dict[str, Dict[str, Any]] = {}
    needs_persist = False
    for service, value in data.items():
        entry, changed = _normalize_entry(value)
        if entry is None:
            continue
        if changed:
            needs_persist = True
        normalized[service] = entry

    if needs_persist:
        _save_all_keys(normalized)

    return normalized


def _save_all_keys(data: Dict[str, Dict[str, Any]]) -> None:  # pragma: no cover - simple IO
    f = _fernet()
    _key_file().write_bytes(f.encrypt(json.dumps(data).encode()))


def get_all_keys() -> Dict[str, Dict[str, Any]]:  # pragma: no cover - thin wrapper
    """Return stored key metadata indexed by service name."""
    return _load_all_keys()


def list_key_metadata() -> List[Dict[str, Any]]:
    """Return key summaries for API responses."""

    records: List[Dict[str, Any]] = []
    for service, entry in _load_all_keys().items():
        ciphertext = entry.get("ciphertext")
        encrypted = isinstance(ciphertext, str) and bool(ciphertext)
        masked = ""
        if encrypted:
            try:
                masked = _mask_key(_decrypt_value(ciphertext))
            except Exception:
                masked = ""
        records.append(
            {
                "service": service,
                "keyMasked": masked,
                "status": entry.get("status", DEFAULT_STATUS),
                "lastUsed": entry.get("lastUsed"),
                "encrypted": encrypted,
            }
        )
    return records


def store_key(name: str, key: str, status: str = DEFAULT_STATUS) -> None:  # pragma: no cover - thin wrapper
    """Store a named API key in encrypted storage with metadata."""

    data = _load_all_keys()
    existing = data.get(name)
    status_value = status or DEFAULT_STATUS
    if existing and existing.get("status"):
        status_value = existing["status"]

    data[name] = {
        "ciphertext": _encrypt_value(key),
        "status": status_value,
        "lastUsed": None,
    }
    _save_all_keys(data)


def mark_key_used(name: str) -> None:
    """Update the last-used timestamp for the specified key."""

    data = _load_all_keys()
    entry = data.get(name)
    if not entry:
        return
    entry["lastUsed"] = _now_iso()
    data[name] = entry
    _save_all_keys(data)


def get_api_key() -> Optional[str]:
    """Load the OpenAI API key from env, keyring, or encrypted file."""
    key = os.getenv("OPENAI_API_KEY")
    if key:
        mark_key_used("openai")
        return key
    if keyring:
        try:
            key = keyring.get_password(SERVICE_NAME, "api_key")
        except KeyringError:
            key = None
        if key:
            os.environ["OPENAI_API_KEY"] = key
            mark_key_used("openai")
            return key
    entries = _load_all_keys()
    entry = entries.get("openai")
    if entry and isinstance(entry.get("ciphertext"), str):
        try:
            key = _decrypt_value(entry["ciphertext"])
        except Exception:
            key = None
        if key:
            entry["lastUsed"] = _now_iso()
            entries["openai"] = entry
            _save_all_keys(entries)
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
            store_key("openai", key)
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
