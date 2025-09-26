import pytest

from backend.pdf_render import render_pdf_from_html, render_pdf_from_text


def test_render_pdf_from_text_produces_bytes():
    payload = "Patient is recovering well after procedure."
    pdf_bytes = render_pdf_from_text(payload, title="Note")
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 0


def test_render_pdf_from_html_handles_markup():
    html = "<h1>Heading</h1><p>Paragraph with <strong>content</strong>.</p>"
    pdf_bytes = render_pdf_from_html(html, title="Doc")
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 0


def test_rendering_rejects_empty_input():
    with pytest.raises(ValueError):
        render_pdf_from_text("", title="Empty")
    with pytest.raises(ValueError):
        render_pdf_from_html("", title="Empty")
