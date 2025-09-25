import pytest

from backend.pdf_render import render_note_pdf, render_summary_pdf


def test_render_note_pdf_produces_bytes():
    payload = "Patient is recovering well after procedure."
    pdf_bytes = render_note_pdf(payload)
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 0


def test_render_summary_pdf_handles_mapping():
    summary = {"patient": {"name": "Alice"}, "plan": ["Follow up in 2 weeks"]}
    pdf_bytes = render_summary_pdf(summary)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 0


def test_rendering_rejects_empty_input():
    with pytest.raises(ValueError):
        render_note_pdf("")
    with pytest.raises(ValueError):
        render_summary_pdf("")
