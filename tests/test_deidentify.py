import backend.main as bm


def test_deidentify_removes_phi(monkeypatch):
    monkeypatch.setattr(bm, "USE_ADVANCED_SCRUBBER", True)
    text = (
        "Patient John Doe visited on 01/23/2020. Lives at 123 Main St. "
        "Call 555-123-4567 or email john@example.com. SSN 123-45-6789."
    )
    cleaned = bm.deidentify(text)
    assert "John Doe" not in cleaned
    assert "555-123-4567" not in cleaned
    assert "john@example.com" not in cleaned
    assert "123-45-6789" not in cleaned
    assert "123 Main St" not in cleaned
    assert "01/23/2020" not in cleaned
