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


class _SecretsBackend:
    """Basic interface for external secrets backends."""

    name = "external"
    writable = False

    def load(self, name: str) -> Tuple[Optional[str], Dict[str, Any]]:
        raise NotImplementedError

    def store(self, name: str, value: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        raise SecretReadOnlyError(
            "The configured secrets backend is read-only. Rotate secrets in the external manager."
        )


_BACKEND_CACHE: Optional[_SecretsBackend] = None
_BACKEND_CACHE_NAME: Optional[str] = None


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


def _backend_name() -> str:
    backend = os.getenv("SECRETS_BACKEND", "auto").strip().lower()
    if backend in {"", "auto"}:
        return "file" if _is_dev_env() else "env"
    return backend


def _standardize_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    normalized: Dict[str, Any] = {}
    rotated = metadata.get("rotatedAt") or metadata.get("rotated_at")
    if rotated:
        normalized["rotatedAt"] = str(rotated)
    version = metadata.get("version")
    if version:
        normalized["version"] = str(version)
    expires = metadata.get("expiresAt") or metadata.get("expires_at")
    if expires:
        normalized["expiresAt"] = str(expires)
    last_used = metadata.get("lastUsed") or metadata.get("last_used")
    if last_used:
        normalized["lastUsed"] = str(last_used)
    source = metadata.get("source")
    if source:
        normalized["source"] = str(source)
    return normalized


def _record_backend_metadata(
    name: str, metadata: Dict[str, Any], *, default_source: str
) -> Dict[str, Any]:
    normalized = _standardize_metadata(metadata)
    source = normalized.get("source") or default_source
    last_used = normalized["lastUsed"] if "lastUsed" in normalized else _MISSING
    return _record_metadata(
        name,
        source=source,
        rotated_at=normalized.get("rotatedAt"),
        version=normalized.get("version"),
        expires_at=normalized.get("expiresAt"),
        last_used=last_used,
    )


def _get_backend() -> Optional[_SecretsBackend]:
    backend_name = _backend_name()
    if backend_name in {"env", "environment", "file", "local", "none"}:
        return None

    global _BACKEND_CACHE, _BACKEND_CACHE_NAME
    if _BACKEND_CACHE and _BACKEND_CACHE_NAME == backend_name:
        return _BACKEND_CACHE

    if backend_name in {"aws", "aws-secrets-manager"}:
        backend = _AWSSecretsManagerBackend()
    elif backend_name in {"vault", "hashicorp", "hashicorp-vault"}:
        backend = _VaultSecretsBackend()
    else:
        raise SecretError(f"Unknown secrets backend '{backend_name}'")

    _BACKEND_CACHE = backend
    _BACKEND_CACHE_NAME = backend_name
    return backend


class _AWSSecretsManagerBackend(_SecretsBackend):
    name = "aws-secrets-manager"
    writable = True

    def __init__(self) -> None:
        try:
            import boto3
        except Exception as exc:  # pragma: no cover - optional dependency
            raise SecretError(
                "boto3 is required for the AWS Secrets Manager backend. Install boto3 and retry."
            ) from exc

        region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
        if not region:
            raise SecretError(
                "AWS_REGION or AWS_DEFAULT_REGION must be set when using the AWS Secrets Manager backend."
            )

        self._client = boto3.client("secretsmanager", region_name=region)
        self._resource_not_found = self._client.exceptions.ResourceNotFoundException
        self._prefix = os.getenv("SECRETS_PREFIX", "RevenuePilot/")

    def _secret_id(self, name: str) -> str:
        prefix = self._prefix or ""
        if "{name}" in prefix:
            try:
                return prefix.format(name=name)
            except Exception as exc:
                raise SecretError(
                    f"SECRETS_PREFIX format is invalid for name '{name}': {exc}"
                ) from exc
        if prefix and not prefix.endswith("/"):
            prefix = f"{prefix}/"
        return f"{prefix}{name}" if prefix else name

    def load(self, name: str) -> Tuple[Optional[str], Dict[str, Any]]:
        secret_id = self._secret_id(name)
        try:
            response = self._client.get_secret_value(SecretId=secret_id)
        except self._resource_not_found:
            return None, {}
        except Exception as exc:  # pragma: no cover - network errors
            raise SecretError(
                f"Failed to read secret '{secret_id}' from AWS Secrets Manager: {exc}"
            ) from exc

        secret_string = response.get("SecretString")
        if not secret_string:
            return None, {}

        try:
            payload = json.loads(secret_string)
        except json.JSONDecodeError:
            payload = {"value": secret_string}

        value = payload.get("value")
        if value is None:
            value = secret_string

        metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        metadata = _standardize_metadata(metadata)
        if not metadata.get("rotatedAt") and response.get("CreatedDate"):
            metadata["rotatedAt"] = response["CreatedDate"].isoformat()
        if not metadata.get("version") and response.get("VersionId"):
            metadata["version"] = str(response["VersionId"])
        metadata.setdefault("source", self.name)
        return value, metadata

    def store(self, name: str, value: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        secret_id = self._secret_id(name)
        payload = {"value": value, "metadata": _standardize_metadata(metadata)}
        body = json.dumps(payload)
        metadata_out = payload["metadata"].copy()
        try:
            response = self._client.put_secret_value(
                SecretId=secret_id,
                SecretString=body,
            )
        except self._resource_not_found:
            try:
                response = self._client.create_secret(Name=secret_id, SecretString=body)
            except Exception as exc:  # pragma: no cover - network errors
                raise SecretError(
                    f"Unable to create secret '{secret_id}' in AWS Secrets Manager: {exc}"
                ) from exc
        except Exception as exc:  # pragma: no cover - network errors
            raise SecretError(
                f"Unable to write secret '{secret_id}' to AWS Secrets Manager: {exc}"
            ) from exc

        if isinstance(response, dict):
            version = response.get("VersionId") or response.get("ARN")
            if version and not metadata_out.get("version"):
                metadata_out["version"] = str(version)
        metadata_out.setdefault("source", self.name)
        if metadata_out.get("rotatedAt") is None:
            metadata_out["rotatedAt"] = _now_iso()
        return metadata_out


class _VaultSecretsBackend(_SecretsBackend):
    name = "hashicorp-vault"
    writable = True

    def __init__(self) -> None:
        try:
            import hvac
        except Exception as exc:  # pragma: no cover - optional dependency
            raise SecretError(
                "hvac is required for the Vault secrets backend. Install hvac and retry."
            ) from exc

        url = os.getenv("VAULT_ADDR")
        token = os.getenv("VAULT_TOKEN")
        if not url or not token:
            raise SecretError(
                "VAULT_ADDR and VAULT_TOKEN must be set when using the Vault secrets backend."
            )

        namespace = os.getenv("VAULT_NAMESPACE") or None
        self._client = hvac.Client(url=url, token=token, namespace=namespace)
        if not self._client.is_authenticated():  # pragma: no cover - network check
            raise SecretError("Failed to authenticate with Vault using the provided token.")

        self._mount = os.getenv("VAULT_MOUNT", "secret")
        self._base_path = os.getenv("VAULT_BASE_PATH", "revenuepilot")
        self._path_template = os.getenv("VAULT_SECRET_TEMPLATE")
        self._invalid_path = hvac.exceptions.InvalidPath

    def _path(self, name: str) -> str:
        if self._path_template:
            try:
                return self._path_template.format(name=name)
            except Exception as exc:
                raise SecretError(
                    f"VAULT_SECRET_TEMPLATE format is invalid for name '{name}': {exc}"
                ) from exc
        base = (self._base_path or "").strip("/")
        if not base:
            return name
        return f"{base}/{name}".strip("/")

    def load(self, name: str) -> Tuple[Optional[str], Dict[str, Any]]:
        path = self._path(name)
        try:
            response = self._client.secrets.kv.v2.read_secret_version(
                mount_point=self._mount,
                path=path,
            )
        except self._invalid_path:
            return None, {}
        except Exception as exc:  # pragma: no cover - network errors
            raise SecretError(f"Failed to read secret '{path}' from Vault: {exc}") from exc

        data = response.get("data") or {}
        secret_data = data.get("data") or {}
        value = secret_data.get("value")
        if value is None:
            return None, {}
        metadata = secret_data.get("metadata") if isinstance(secret_data.get("metadata"), dict) else {}
        metadata = _standardize_metadata(metadata)
        metadata.setdefault("source", self.name)
        version_info = data.get("metadata") or {}
        if version_info.get("version") and not metadata.get("version"):
            metadata["version"] = str(version_info["version"])
        if version_info.get("created_time") and not metadata.get("rotatedAt"):
            metadata["rotatedAt"] = version_info["created_time"]
        return value, metadata

    def store(self, name: str, value: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        path = self._path(name)
        normalized = _standardize_metadata(metadata)
        payload = {"value": value, "metadata": normalized}
        try:
            response = self._client.secrets.kv.v2.create_or_update_secret(
                mount_point=self._mount,
                path=path,
                secret=payload,
            )
        except Exception as exc:  # pragma: no cover - network errors
            raise SecretError(f"Failed to write secret '{path}' to Vault: {exc}") from exc

        metadata_out = normalized.copy()
        if isinstance(response, dict):
            data_meta = response.get("data") or {}
            if data_meta.get("version") and not metadata_out.get("version"):
                metadata_out["version"] = str(data_meta["version"])
            if data_meta.get("created_time") and not metadata_out.get("rotatedAt"):
                metadata_out["rotatedAt"] = data_meta["created_time"]
        metadata_out.setdefault("source", self.name)
        if metadata_out.get("rotatedAt") is None:
            metadata_out["rotatedAt"] = _now_iso()
        return metadata_out


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

    backend = _get_backend()
    if backend is None and not allow_fallback:
        allow_fallback = True
    if backend:
        backend_value, backend_metadata = backend.load(name)
        if backend_value:
            metadata = _record_backend_metadata(
                name,
                backend_metadata,
                default_source=backend.name,
            )
            _validate_rotation(
                name,
                metadata,
                max_age_days=max_age_days,
                allow_missing=allow_missing_rotation,
            )
            os.environ[env_var] = backend_value
            return backend_value, metadata

    if allow_fallback:
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
    backend = _get_backend()
    if backend is None and not allow_fallback:
        # When no external backend is configured we fall back to the local store
        # even in production environments so that tests and offline operation
        # remain functional.
        allow_fallback = True
    rotated = _now_iso()
    version = str(uuid.uuid4())
    metadata_payload: Dict[str, Any] = {
        "rotatedAt": rotated,
        "version": version,
    }
    if source:
        metadata_payload["source"] = source

    if backend:
        if not backend.writable:
            raise SecretReadOnlyError(
                "The configured secrets backend is read-only; rotate the secret in the external manager."
            )
        metadata = backend.store(name, value, metadata_payload)
        record = _record_backend_metadata(name, metadata, default_source=backend.name)
        os.environ[env_var] = value
        return record

    if not allow_fallback:
        raise SecretReadOnlyError(
            "Cannot persist secret locally because the external backend is read-only and the fallback store is disabled."
        )

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
