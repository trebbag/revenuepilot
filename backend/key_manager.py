import os
import stat
import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple, Callable

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

# Mapping of known secret identifiers to their environment variable names.
SECRET_ENV_MAPPING: Dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "jwt": "JWT_SECRET",
}

_METADATA_FILENAME = "secrets_metadata.json"
_ENV_DEV_VALUES = {"development", "dev", "local"}
_DEFAULT_SECRET_MAX_AGE_DAYS = 90


class SecretError(Exception):
    """Base error for secret management failures."""


class SecretNotFoundError(SecretError):
    """Raised when a required secret is not available."""


class SecretReadOnlyError(SecretError):
    """Raised when attempting to modify a read-only secrets backend."""


class SecretRotationError(SecretError):
    """Raised when rotation metadata is missing or indicates staleness."""


_MISSING = object()


def _metadata_file() -> Path:
    return _base_dir() / _METADATA_FILENAME


def _load_metadata() -> Dict[str, Dict[str, Any]]:
    path = _metadata_file()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_metadata(data: Dict[str, Dict[str, Any]]) -> None:  # pragma: no cover - simple IO
    _metadata_file().write_text(json.dumps(data, indent=2), encoding="utf-8")


def _record_metadata(
    name: str,
    *,
    source: Optional[str] = None,
    rotated_at: Optional[str] = None,
    version: Optional[str] = None,
    expires_at: Optional[str] = None,
    last_used: Any = _MISSING,
) -> Dict[str, Any]:
    data = _load_metadata()
    record = data.get(name, {}).copy()
    if source:
        record["source"] = source
    if rotated_at is not None:
        record["rotatedAt"] = rotated_at
    if version is not None:
        record["version"] = version
    if expires_at is not None:
        record["expiresAt"] = expires_at
    if last_used is not _MISSING:
        record["lastUsed"] = last_used
    record["updatedAt"] = _now_iso()
    data[name] = record
    _save_metadata(data)
    return record


def _get_metadata(name: str) -> Dict[str, Any]:
    return _load_metadata().get(name, {}).copy()


def _parse_iso(value: str) -> Optional[datetime]:
    try:
        cleaned = value.strip()
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        parsed = datetime.fromisoformat(cleaned)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_dev_env() -> bool:
    return os.getenv("ENVIRONMENT", "development").lower() in _ENV_DEV_VALUES


def _allow_fallback() -> bool:
    fallback_env = os.getenv("SECRETS_FALLBACK", "auto").lower()
    if fallback_env == "always":
        return True
    if fallback_env == "never":
        return False
    return _is_dev_env()


def _max_age_days(default: int) -> Optional[int]:
    value = os.getenv("SECRET_MAX_AGE_DAYS")
    if value:
        try:
            return int(value)
        except ValueError:
            pass
    return default


def _validate_rotation(
    name: str,
    metadata: Dict[str, Any],
    *,
    max_age_days: Optional[int],
    allow_missing: bool,
) -> None:
    if not max_age_days:
        return
    rotated_at = metadata.get("rotatedAt") or metadata.get("rotated_at")
    if not rotated_at:
        if allow_missing:
            return
        raise SecretRotationError(
            f"Rotation timestamp for '{name}' is missing. Provide {name.upper()}_ROTATED_AT or update the secrets metadata."
        )
    parsed = _parse_iso(str(rotated_at))
    if not parsed:
        if allow_missing:
            return
        raise SecretRotationError(
            f"Rotation timestamp for '{name}' is not a valid ISO-8601 datetime: {rotated_at}"
        )
    if parsed < datetime.now(timezone.utc) - timedelta(days=max_age_days):
        raise SecretRotationError(
            f"Secret '{name}' appears stale (rotated {rotated_at}). Rotate at least every {max_age_days} days."
        )


def _env_metadata(env_var: str) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    rotated = os.getenv(f"{env_var}_ROTATED_AT")
    version = os.getenv(f"{env_var}_VERSION")
    expires = os.getenv(f"{env_var}_EXPIRES_AT")
    source = os.getenv(f"{env_var}_SOURCE") or "environment"
    if rotated:
        metadata["rotatedAt"] = rotated
    if version:
        metadata["version"] = version
    if expires:
        metadata["expiresAt"] = expires
    metadata["source"] = source
    return metadata


def load_secret(
    name: str,
    env_var: str,
    *,
    required: bool = False,
    allow_fallback: Optional[bool] = None,
    max_age_days: Optional[int] = None,
    allow_missing_rotation: Optional[bool] = None,
) -> Tuple[Optional[str], Dict[str, Any]]:
    """Load a secret via environment-backed manager with optional fallback."""

    allow_fallback = _allow_fallback() if allow_fallback is None else allow_fallback
    allow_missing_rotation = (
        _is_dev_env() if allow_missing_rotation is None else allow_missing_rotation
    )
    max_age_days = max_age_days or _max_age_days(_DEFAULT_SECRET_MAX_AGE_DAYS)

    env_value = os.getenv(env_var)
    if env_value:
        metadata = _env_metadata(env_var)
        record = _record_metadata(
            name,
            source=metadata.get("source", "environment"),
            rotated_at=metadata.get("rotatedAt"),
            version=metadata.get("version"),
            expires_at=metadata.get("expiresAt"),
        )
        metadata = {**record}
        _validate_rotation(
            name,
            metadata,
            max_age_days=max_age_days,
            allow_missing=allow_missing_rotation,
        )
        return env_value, metadata

    entries = _load_all_keys()
    entry = entries.get(name)
    decrypted: Optional[str] = None
    if entry and isinstance(entry.get("ciphertext"), str):
        try:
            decrypted = _decrypt_value(entry["ciphertext"])
        except Exception:
            decrypted = None
    if decrypted:
        os.environ[env_var] = decrypted
        metadata = _get_metadata(name)
        if not metadata or metadata.get("source") != "local-file":
            metadata = _record_metadata(name, source="local-file")
        _validate_rotation(
            name,
            metadata,
            max_age_days=max_age_days,
            allow_missing=allow_missing_rotation,
        )
        return decrypted, metadata

    legacy_path = _legacy_file()
    if legacy_path.exists():
        try:
            legacy_value = legacy_path.read_text(encoding="utf-8").strip()
        except OSError:
            legacy_value = ""
        if legacy_value:
            os.environ[env_var] = legacy_value
            metadata = _record_metadata(name, source="legacy-file")
            _validate_rotation(
                name,
                metadata,
                max_age_days=max_age_days,
                allow_missing=allow_missing_rotation,
            )
            return legacy_value, metadata

    if required:
        raise SecretNotFoundError(
            f"Secret '{name}' is not configured. Provide {env_var} via the secrets backend or enable the local development fallback."
        )
    return None, {}


def store_secret(
    name: str,
    env_var: str,
    value: str,
    *,
    allow_fallback: Optional[bool] = None,
    source: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist a secret via the writable backend or local fallback."""

    allow_fallback = _allow_fallback() if allow_fallback is None else allow_fallback
    backend = os.getenv("SECRETS_BACKEND", "auto").lower()
    if backend in {"env", "environment"} and not allow_fallback:
        raise SecretReadOnlyError(
            "The configured secrets backend is environment-managed; rotate the secret in the external store."
        )

    rotated = _now_iso()
    version = str(uuid.uuid4())
    store_key(
        name,
        value,
        rotated_at=rotated,
        version=version,
        source=source or "local-file",
    )
    os.environ[env_var] = value
    return _get_metadata(name)


def require_secret(
    name: str,
    env_var: str,
    *,
    description: Optional[str] = None,
    max_age_days: Optional[int] = None,
    allow_fallback: Optional[bool] = None,
    allow_missing_rotation: Optional[bool] = None,
) -> str:
    """Return a configured secret or raise with a helpful error."""

    effective_fallback = _allow_fallback() if allow_fallback is None else allow_fallback
    try:
        value, metadata = load_secret(
            name,
            env_var,
            required=True,
            allow_fallback=effective_fallback,
            max_age_days=max_age_days,
            allow_missing_rotation=allow_missing_rotation,
        )
    except SecretNotFoundError as exc:
        label = description or f"secret '{name}'"
        raise SecretNotFoundError(
            f"{label} is not configured. Provide {env_var} via the configured secrets backend."
        ) from exc
    source = metadata.get("source") if isinstance(metadata, dict) else None
    if not effective_fallback and source and source != "environment":
        label = description or f"secret '{name}'"
        raise SecretNotFoundError(
            f"{label} is configured via a local fallback. Provide {env_var} from the external secrets manager."
        )
    return value  # type: ignore[return-value]


def ensure_local_secret(
    name: str,
    env_var: str,
    generator: Callable[[], str],
    *,
    allow_fallback: Optional[bool] = None,
) -> str:
    """Ensure a development secret exists and return it."""

    allow_fallback = _allow_fallback() if allow_fallback is None else allow_fallback
    value, _ = load_secret(name, env_var, allow_fallback=allow_fallback, required=False)
    if value:
        return value
    if not allow_fallback:
        raise SecretReadOnlyError(
            f"Cannot provision '{name}' locally because the fallback store is disabled."
        )
    new_value = generator()
    store_secret(name, env_var, new_value, allow_fallback=True, source="local-file")
    return new_value


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
    entries = _load_all_keys()
    metadata_map = _load_metadata()
    all_services = sorted(set(entries.keys()) | set(metadata_map.keys()))
    for service in all_services:
        entry = entries.get(service, {})
        metadata = metadata_map.get(service, {})
        ciphertext = entry.get("ciphertext")
        encrypted = isinstance(ciphertext, str) and bool(ciphertext)
        masked = ""
        if encrypted:
            try:
                masked = _mask_key(_decrypt_value(ciphertext))
            except Exception:
                masked = ""
        else:
            env_var = SECRET_ENV_MAPPING.get(service)
            if env_var:
                env_value = os.getenv(env_var)
                if env_value:
                    masked = _mask_key(env_value)
        source = metadata.get("source")
        if not source and encrypted:
            source = "local-file"
        record = {
            "service": service,
            "keyMasked": masked,
            "status": entry.get("status", DEFAULT_STATUS),
            "lastUsed": metadata.get("lastUsed") or entry.get("lastUsed"),
            "encrypted": encrypted,
            "rotatedAt": metadata.get("rotatedAt"),
            "version": metadata.get("version"),
            "source": source,
            "expiresAt": metadata.get("expiresAt"),
        }
        records.append(record)
    return records


def store_key(
    name: str,
    key: str,
    status: str = DEFAULT_STATUS,
    *,
    rotated_at: Optional[str] = None,
    version: Optional[str] = None,
    source: Optional[str] = None,
) -> None:  # pragma: no cover - thin wrapper
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
    _record_metadata(
        name,
        source=source or "local-file",
        rotated_at=rotated_at or _now_iso(),
        version=version or str(uuid.uuid4()),
        last_used=None,
    )


def mark_key_used(name: str) -> None:
    """Update the last-used timestamp for the specified key."""

    data = _load_all_keys()
    entry = data.get(name)
    timestamp = _now_iso()
    if not entry:
        _record_metadata(name, last_used=timestamp)
        return
    entry["lastUsed"] = timestamp
    data[name] = entry
    _save_all_keys(data)
    _record_metadata(name, last_used=timestamp)


def get_api_key() -> Optional[str]:
    """Load the OpenAI API key from the configured secrets backend."""

    try:
        key, _ = load_secret("openai", "OPENAI_API_KEY")
    except SecretRotationError:
        raise
    if key:
        mark_key_used("openai")
        return key

    if keyring:
        try:
            key = keyring.get_password(SERVICE_NAME, "api_key")
        except KeyringError:
            key = None
        if key:
            try:
                store_secret("openai", "OPENAI_API_KEY", key)
            except SecretReadOnlyError:
                os.environ["OPENAI_API_KEY"] = key
                _record_metadata("openai", source="keyring")
            mark_key_used("openai")
            return key

    return None


def save_api_key(key: str) -> None:
    """Persist the API key to keyring or encrypted file."""
    store_secret("openai", "OPENAI_API_KEY", key)
    if keyring:
        try:
            keyring.set_password(SERVICE_NAME, "api_key", key)
        except KeyringError:
            pass
    legacy = _legacy_file()
    try:
        legacy.write_text(key, encoding="utf-8")
        if os.name == "nt":
            os.chmod(legacy, stat.S_IREAD | stat.S_IWRITE)
        else:
            os.chmod(legacy, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
