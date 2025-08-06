import pytest
import backend.main as bm


@pytest.mark.parametrize(
    "text,token,raw",
    [
        ("Patient John Doe presented.", "[NAME]", "John Doe"),
        ("Call 555-123-4567 for help", "[PHONE]", "555-123-4567"),
        ("Call (555) 987 6543 for help", "[PHONE]", "(555) 987 6543"),
        ("DOB 01/23/2020", "[DATE]", "01/23/2020"),
        ("DOB 2020-01-23", "[DATE]", "2020-01-23"),
        ("DOB March 3, 2020", "[DATE]", "March 3, 2020"),
        ("Lives at 123 Main St.", "[ADDRESS]", "123 Main St"),
        ("SSN 123-45-6789", "[SSN]", "123-45-6789"),
    ],
)

def test_deidentify_diverse_formats(monkeypatch, text, token, raw):
    monkeypatch.setattr(bm, "USE_ADVANCED_SCRUBBER", False)
    cleaned = bm.deidentify(text)
    assert token in cleaned
    assert raw not in cleaned


def test_deidentify_tokens_present(monkeypatch):
    monkeypatch.setattr(bm, "USE_ADVANCED_SCRUBBER", False)
    text = (
        "Patient John Doe visited on 01/23/2020. Lives at 123 Main St. "
        "Call 555-123-4567 or email john@example.com. SSN 123-45-6789."
    )
    cleaned = bm.deidentify(text)
    assert "[NAME]" in cleaned
    assert "[DATE]" in cleaned
    assert "[ADDRESS]" in cleaned
    assert "[PHONE]" in cleaned
    assert "[EMAIL]" in cleaned
    assert "[SSN]" in cleaned
