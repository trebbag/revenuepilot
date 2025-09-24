"""Centralised helpers for encrypting sensitive payloads at rest.

The module provides two independent encryption domains:

``artifact``
    Used for uploaded chart files and any intermediate artifacts written to
    disk.  The ciphertext is persisted verbatim to the filesystem.

``ai_payload``
    Used for structured AI inputs/outputs that are stored in relational
    databases.  Ciphertext is base64 encoded and wrapped in a small JSON
    envelope so legacy rows can be upgraded transparently.

Keys are resolved through :mod:`backend.key_manager`.  In production the
secrets backend should be wired to a cloud KMS; during tests or local
development the fallback store (encrypted via Fernet) is used.  The helpers
expose simple ``encrypt_*`` / ``decrypt_*`` primitives so callers do not need
to reason about key management directly.
"""

from __future__ import annotations

import base64
import json
from functools import lru_cache
from typing import Any, Dict, Mapping

from cryptography.fernet import Fernet, InvalidToken

from backend import key_manager

_ARTIFACT_SECRET_NAME = "artifact-encryption-key"
_ARTIFACT_ENV_VAR = "ARTIFACT_ENCRYPTION_KEY"

_AI_SECRET_NAME = "ai-payload-encryption-key"
_AI_ENV_VAR = "AI_PAYLOAD_ENCRYPTION_KEY"


def _ensure_key(name: str, env_var: str) -> bytes:
    """Return a stable key for *name*, creating one if required."""

    value, _metadata = key_manager.load_secret(
        name,
        env_var,
        required=False,
        allow_missing_rotation=True,
    )
    if value:
        return value.encode("utf-8")

    generated = Fernet.generate_key().decode("utf-8")
    key_manager.store_secret(name, env_var, generated, source="generated")
    return generated.encode("utf-8")


@lru_cache(maxsize=2)
def _artifact_cipher() -> Fernet:
    return Fernet(_ensure_key(_ARTIFACT_SECRET_NAME, _ARTIFACT_ENV_VAR))


@lru_cache(maxsize=2)
def _ai_cipher() -> Fernet:
    return Fernet(_ensure_key(_AI_SECRET_NAME, _AI_ENV_VAR))


def encrypt_artifact(data: bytes) -> bytes:
    """Encrypt *data* for storage on disk."""

    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("artifact payload must be bytes-like")
    return _artifact_cipher().encrypt(bytes(data))


def decrypt_artifact(blob: bytes) -> bytes:
    """Decrypt previously stored artifact *blob*."""

    if not isinstance(blob, (bytes, bytearray)):
        raise TypeError("artifact ciphertext must be bytes-like")
    try:
        return _artifact_cipher().decrypt(bytes(blob))
    except InvalidToken as exc:  # pragma: no cover - defensive guard
        raise ValueError("Artifact ciphertext could not be decrypted") from exc


def encrypt_ai_payload(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Return an encrypted wrapper for *payload* suitable for DB storage."""

    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    token = _ai_cipher().encrypt(serialized.encode("utf-8"))
    return {
        "ciphertext": base64.b64encode(token).decode("ascii"),
        "algorithm": "fernet",
    }


def decrypt_ai_payload(wrapper: Mapping[str, Any]) -> Dict[str, Any]:
    """Return the plaintext payload from an encrypted *wrapper*."""

    ciphertext = wrapper.get("ciphertext") if isinstance(wrapper, Mapping) else None
    if not isinstance(ciphertext, str):
        raise ValueError("Encrypted payload missing ciphertext")
    try:
        token = base64.b64decode(ciphertext.encode("ascii"))
    except Exception as exc:  # pragma: no cover - invalid base64
        raise ValueError("Encrypted payload contained invalid base64") from exc
    try:
        plaintext = _ai_cipher().decrypt(token)
    except InvalidToken as exc:
        raise ValueError("Encrypted payload could not be decrypted") from exc
    try:
        return json.loads(plaintext.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Encrypted payload was not valid JSON") from exc


def rotate_artifact_key() -> None:
    """Rotate the artifact encryption key."""

    generated = Fernet.generate_key().decode("utf-8")
    key_manager.store_secret(
        _ARTIFACT_SECRET_NAME,
        _ARTIFACT_ENV_VAR,
        generated,
        source="rotated",
    )
    _artifact_cipher.cache_clear()


def rotate_ai_payload_key() -> None:
    """Rotate the AI payload encryption key."""

    generated = Fernet.generate_key().decode("utf-8")
    key_manager.store_secret(
        _AI_SECRET_NAME,
        _AI_ENV_VAR,
        generated,
        source="rotated",
    )
    _ai_cipher.cache_clear()


__all__ = [
    "decrypt_ai_payload",
    "decrypt_artifact",
    "encrypt_ai_payload",
    "encrypt_artifact",
    "rotate_ai_payload_key",
    "rotate_artifact_key",
]

