import pytest
from types import SimpleNamespace

import backend.main as bm
import backend.security as security

if bm._SCRUBBER_AVAILABLE:  # pragma: no cover - optional import for tests
    import scrubadub  # type: ignore
else:  # pragma: no cover - library missing
    scrubadub = None  # type: ignore


@pytest.mark.parametrize(
    "text,token,raw",
    [
        ("Patient John Doe presented.", "[NAME:", "John Doe"),
        ("Patient Maria de la Cruz presented.", "[NAME:", "Maria de la Cruz"),
        ("Dr. John Doe arrived.", "[NAME:", "Dr. John Doe"),
        ("Call 555-123-4567 for help", "[PHONE:", "555-123-4567"),
        ("Call (555) 987 6543 for help", "[PHONE:", "(555) 987 6543"),
        ("Call +44 20 7946 0958 for help", "[PHONE:", "+44 20 7946 0958"),
        ("Call +1 (415) 555-2671 for help", "[PHONE:", "+1 (415) 555-2671"),
        ("DOB 01/23/2020", "[DOB:", "01/23/2020"),
        ("DOB 2020-01-23", "[DATE:", "2020-01-23"),
        ("DOB March 3, 2020", "[DATE:", "March 3, 2020"),
        ("DOB March 3rd, 2020", "[DATE:", "March 3rd, 2020"),
        ("DOB 3 March 2020", "[DATE:", "3 March 2020"),
        ("Patient seen 05/03/2020", "[DATE:", "05/03/2020"),
        ("Lives at 123 Main St.", "[ADDRESS:", "123 Main St"),
        ("Lives at 789 Broadway", "[ADDRESS:", "789 Broadway"),
        ("SSN 123-45-6789", "[SSN:", "123-45-6789"),
        ("SSN 123456789", "[SSN:", "123456789"),
        ("Contact maria.cruz@example.com", "[EMAIL:", "maria.cruz@example.com"),
        ("Visit https://example.com for info", "[URL:", "https://example.com"),
        ("Ping 192.168.0.1 for access", "[IP:", "192.168.0.1"),
        ("MRN 1234567", "[MRN:", "1234567"),
        ("Patient O'Neil presented.", "[NAME:", "O'Neil"),
        ("Patient Anne-Marie O'Connor presented.", "[NAME:", "Anne-Marie O'Connor"),

    ],
)

def test_deidentify_diverse_formats(monkeypatch, text, token, raw):
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", False)
    monkeypatch.setattr(bm, "_DEID_ENGINE", "regex")
    cleaned = bm.deidentify(text)
    assert token in cleaned
    assert raw not in cleaned


def test_deidentify_handles_complex_phi(monkeypatch):
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", False)
    monkeypatch.setattr(bm, "_DEID_ENGINE", "regex")
    text = (
        "Patient Maria de la Cruz visited on March 3rd, 2020. Lives at 456 Elm Street. "
        "Call (555) 123-4567 or email maria.cruz@example.com. SSN 321-54-9876."
    )
    cleaned = bm.deidentify(text)
    assert "[NAME:" in cleaned
    assert "[DATE:" in cleaned
    assert "[ADDRESS:" in cleaned
    assert "[PHONE:" in cleaned
    assert "[EMAIL:" in cleaned
    assert "[SSN:" in cleaned


def test_prompt_guard_applies_deid_policy(monkeypatch):
    monkeypatch.setattr(security.DEID_POLICY, "_engine", "regex")
    request = SimpleNamespace(
        text="Patient John Doe with MRN 1234567.",
        chart="DOB 01/23/2020 and lives at 789 Oak Avenue.",
        audio="Call (555) 111-2222 for follow up.",
        rules=["Contact at (555) 987-6543"],
        age=42,
        sex="F",
        region="CA",
    )
    guard = security.PromptPrivacyGuard()
    context = guard.prepare("summary", request)
    assert "[NAME:" in context.text
    assert "John Doe" not in context.text
    assert "[MRN:" in context.text
    assert "1234567" not in context.text
    assert "[DATE:" in context.text
    assert "01/23/2020" not in context.text
    assert "[PHONE:" in context.text or "[PHONE:" in (context.rules[0] if context.rules else "")
    if context.rules:
        combined_rules = " ".join(context.rules)
        assert "[PHONE:" in combined_rules
        assert "555-987-6543" not in combined_rules


def test_deidentify_combined_entities(monkeypatch):
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", False)
    monkeypatch.setattr(bm, "_DEID_ENGINE", "regex")
    text = "Jane Doe at 123-45-6789 on 2023-07-15"
    cleaned = bm.deidentify(text)
    assert "[NAME:" in cleaned
    assert "[SSN:" in cleaned
    assert "[DATE:" in cleaned


def test_deidentify_can_disable_hashing(monkeypatch):
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", False)
    monkeypatch.setattr(bm, "_DEID_ENGINE", "regex")
    monkeypatch.setattr(bm, "_HASH_TOKENS", False)
    text = "John Doe"
    cleaned = bm.deidentify(text)
    assert "[NAME:John Doe]" in cleaned


@pytest.mark.parametrize(
    "engine,available,expected",
    [
        ("regex", True, ["[NAME:", "[MRN:", "[IP:", "[URL:"]),
        ("presidio", bm._PRESIDIO_AVAILABLE, ["[NAME:", "[MRN:", "[IP:", "[URL:"]),
        ("scrubadub", bm._SCRUBBER_AVAILABLE, ["[EMAIL:", "[URL:"]),
        ("philter", bm._PHILTER_AVAILABLE, ["[PHI:"]),
    ],
)
def test_deidentify_engines(monkeypatch, engine, available, expected):
    if not available:
        pytest.skip(f"{engine} not available")
    monkeypatch.setattr(bm, "_DEID_ENGINE", engine)
    text = (
        "John Doe with MRN 1234567 visited on Jan 1 2020. "
        "Call 555-123-4567 or email john@example.com. "
        "Visit https://example.com from 192.168.0.1"
    )
    cleaned = bm.deidentify(text)
    for token in expected:
        assert token in cleaned


def test_presidio_fallback_to_regex(monkeypatch):
    """Presidio failures should fall back to regex patterns."""

    class Boom:
        def analyze(self, *args, **kwargs):  # pragma: no cover - intentional failure
            raise RuntimeError("boom")

    monkeypatch.setattr(bm, "_DEID_ENGINE", "presidio")
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", True)
    monkeypatch.setattr(bm, "_analyzer", Boom())

    text = "John Doe 555-123-4567"
    cleaned = bm.deidentify(text)
    assert "[NAME:" in cleaned
    assert "[PHONE:" in cleaned


def test_philter_fallback_to_regex(monkeypatch):
    """Philter errors should fall back to regex patterns."""

    class Boom:
        def philter(self, text):  # pragma: no cover - intentional failure
            raise RuntimeError("boom")

    monkeypatch.setattr(bm, "_DEID_ENGINE", "philter")
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", True)
    monkeypatch.setattr(bm, "_philter", Boom())

    text = "John Doe 555-123-4567"
    cleaned = bm.deidentify(text)
    assert "[NAME:" in cleaned
    assert "[PHONE:" in cleaned


def test_scrubadub_fallback_to_regex(monkeypatch):
    """scrubadub errors should fall back to regex patterns."""

    if not bm._SCRUBBER_AVAILABLE:
        pytest.skip("scrubadub not available")

    class Boom:
        def iter_filth(self, *args, **kwargs):  # pragma: no cover - intentional failure
            raise RuntimeError("boom")

    monkeypatch.setattr(bm, "_DEID_ENGINE", "scrubadub")
    monkeypatch.setattr(bm, "_SCRUBBER_AVAILABLE", True)
    monkeypatch.setattr(scrubadub, "Scrubber", lambda: Boom())

    text = "John Doe 555-123-4567"
    cleaned = bm.deidentify(text)
    assert "[NAME:" in cleaned
    assert "[PHONE:" in cleaned


def test_regex_engine(monkeypatch):
    """Explicit regex engine continues to scrub PHI."""

    monkeypatch.setattr(bm, "_DEID_ENGINE", "regex")
    text = "John Doe 555-123-4567"
    cleaned = bm.deidentify(text)
    assert "[NAME:" in cleaned
    assert "[PHONE:" in cleaned
