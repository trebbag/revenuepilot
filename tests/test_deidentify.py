import pytest
import backend.main as bm


@pytest.mark.parametrize(
    "text,token,raw",
    [
        ("Patient John Doe presented.", "[NAME]", "John Doe"),
        ("Patient Maria de la Cruz presented.", "[NAME]", "Maria de la Cruz"),
        ("Dr. John Doe arrived.", "[NAME]", "Dr. John Doe"),
        ("Call 555-123-4567 for help", "[PHONE]", "555-123-4567"),
        ("Call (555) 987 6543 for help", "[PHONE]", "(555) 987 6543"),
        ("Call +44 20 7946 0958 for help", "[PHONE]", "+44 20 7946 0958"),
        ("DOB 01/23/2020", "[DATE]", "01/23/2020"),
        ("DOB 2020-01-23", "[DATE]", "2020-01-23"),
        ("DOB March 3, 2020", "[DATE]", "March 3, 2020"),
        ("DOB March 3rd, 2020", "[DATE]", "March 3rd, 2020"),
        ("DOB 3 March 2020", "[DATE]", "3 March 2020"),
        ("Lives at 123 Main St.", "[ADDRESS]", "123 Main St"),
        ("Lives at 789 Broadway", "[ADDRESS]", "789 Broadway"),
        ("SSN 123-45-6789", "[SSN]", "123-45-6789"),
        ("SSN 123456789", "[SSN]", "123456789"),
        ("Contact maria.cruz@example.com", "[EMAIL]", "maria.cruz@example.com"),
    ],
)

def test_deidentify_diverse_formats(monkeypatch, text, token, raw):
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", False)
    cleaned = bm.deidentify(text)
    assert token in cleaned
    assert raw not in cleaned


def test_deidentify_handles_complex_phi(monkeypatch):
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", False)
    text = (
        "Patient Maria de la Cruz visited on March 3rd, 2020. Lives at 456 Elm Street. "
        "Call (555) 123-4567 or email maria.cruz@example.com. SSN 321-54-9876."
    )
    cleaned = bm.deidentify(text)
    assert "[NAME]" in cleaned
    assert "[DATE]" in cleaned
    assert "[ADDRESS]" in cleaned
    assert "[PHONE]" in cleaned
    assert "[EMAIL]" in cleaned
    assert "[SSN]" in cleaned


def test_deidentify_combined_entities(monkeypatch):
    monkeypatch.setattr(bm, "_PRESIDIO_AVAILABLE", False)
    monkeypatch.setattr(bm, "_PHILTER_AVAILABLE", False)
    text = "Jane Doe at 123-45-6789 on 2023-07-15"
    cleaned = bm.deidentify(text)
    assert "[NAME]" in cleaned
    assert "[SSN]" in cleaned
    assert "[DATE]" in cleaned
