"""Hardened HTTP egress helpers enforcing TLS verification and allowlists."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse
import os

import requests
from prometheus_client import Counter


EGRESS_FAILURES = Counter(
    "revenuepilot_egress_failures_total",
    "Outbound HTTP calls blocked or failed security checks",
    ("reason",),
)


def _allowed_hosts() -> set[str]:
    raw = os.getenv("ALLOWED_EGRESS_HOSTS")
    hosts: set[str] = set()
    if raw:
        hosts.update(host.strip().lower() for host in raw.split(",") if host.strip())
    else:
        hosts.update(
            {
                "api.openai.com",
                "clinicaltables.nlm.nih.gov",
                "www.cdc.gov",
                "api.uspreventiveservicestaskforce.org",
                "www.who.int",
                "localhost",
                "127.0.0.1",
            }
        )
    for env_var in (
        "EHR_PATIENT_API_URL",
        "EHR_TOKEN_URL",
        "EHR_FHIR_BASE_URL",
        "EHR_EXPORT_BASE_URL",
    ):
        value = os.getenv(env_var)
        if not value:
            continue
        parsed = urlparse(value)
        if parsed.hostname:
            hosts.add(parsed.hostname.lower())
    return hosts


def _verify_host(url: str) -> None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    allowed = _allowed_hosts()
    if allowed and host not in allowed:
        EGRESS_FAILURES.labels(reason="disallowed_host").inc()
        raise RuntimeError(f"Egress to host '{host}' is not permitted")


def secure_request(method: str, url: str, **kwargs: Any) -> requests.Response:
    """Dispatch a HTTP request enforcing TLS verification and allowlists."""

    _verify_host(url)
    kwargs.setdefault("timeout", 10)
    kwargs.setdefault("verify", True)
    try:
        response = requests.request(method=method, url=url, **kwargs)
        response.raise_for_status()
        return response
    except requests.exceptions.SSLError:
        EGRESS_FAILURES.labels(reason="tls_failure").inc()
        raise
    except requests.exceptions.RequestException:
        EGRESS_FAILURES.labels(reason="network_failure").inc()
        raise


def secure_get(url: str, **kwargs: Any) -> requests.Response:
    return secure_request("GET", url, **kwargs)


def secure_post(url: str, **kwargs: Any) -> requests.Response:
    return secure_request("POST", url, **kwargs)


__all__ = ["secure_get", "secure_post", "secure_request", "EGRESS_FAILURES"]

