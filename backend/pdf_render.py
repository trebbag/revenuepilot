"""Helpers for rendering finalized note artifacts into PDF documents."""

from __future__ import annotations

import html
import re
import textwrap
from typing import Iterable, List

__all__ = [
    "render_pdf_from_html",
    "render_pdf_from_text",
]


# Basic PDF geometry (Letter size, portrait orientation)
PAGE_WIDTH = 612  # 8.5" * 72pt
PAGE_HEIGHT = 792  # 11" * 72pt
MARGIN = 72  # 1" margins
LINE_HEIGHT = 14
MAX_CHARS_PER_LINE = 90


LINES_PER_PAGE = max(1, int((PAGE_HEIGHT - 2 * MARGIN) // LINE_HEIGHT))


class _HTMLNormalizer:
    """Convert lightweight HTML into newline-delimited plain text."""

    def __init__(self, html_input: str) -> None:
        self.html_input = html_input

    def to_text(self) -> str:
        cleaned = self._replace_line_breaks(self.html_input)
        cleaned = self._strip_tags(cleaned)
        cleaned = html.unescape(cleaned)
        cleaned = self._normalise_whitespace(cleaned)
        return cleaned.strip()

    def _replace_line_breaks(self, value: str) -> str:
        # Replace <br> and </p> style tags with explicit newlines to preserve structure.
        value = re.sub(r"<\s*br\s*/?>", "\n", value, flags=re.IGNORECASE)
        value = re.sub(r"<\s*/\s*p\s*>", "\n\n", value, flags=re.IGNORECASE)
        value = re.sub(r"<\s*/\s*div\s*>", "\n\n", value, flags=re.IGNORECASE)
        value = re.sub(r"<\s*/\s*h[1-6]\s*>", "\n\n", value, flags=re.IGNORECASE)
        value = re.sub(r"<\s*/\s*li\s*>", "\n", value, flags=re.IGNORECASE)
        value = re.sub(r"<\s*li[^>]*>", "\n• ", value, flags=re.IGNORECASE)
        value = re.sub(r"<\s*tr[^>]*>", "\n", value, flags=re.IGNORECASE)
        value = re.sub(r"<\s*td[^>]*>", "\t", value, flags=re.IGNORECASE)
        return value

    def _strip_tags(self, value: str) -> str:
        # Remove any remaining HTML tags. This deliberately avoids a full parser to
        # keep the dependency footprint minimal.
        return re.sub(r"<[^>]+>", "", value)

    def _normalise_whitespace(self, value: str) -> str:
        # Collapse runs of spaces while preserving intentional blank lines.
        value = value.replace("\r", "\n")
        value = re.sub(r"\n{3,}", "\n\n", value)
        value = re.sub(r"[ \t]+", " ", value)
        value = re.sub(r" ?\n", "\n", value)
        return value


def render_pdf_from_html(html_content: str, title: str) -> bytes:
    """Render HTML content into a PDF byte string."""

    if html_content is None:
        raise ValueError("html_content must not be None")

    text = _HTMLNormalizer(html_content).to_text()
    if not text.strip():
        raise ValueError("HTML content produced an empty document")

    return render_pdf_from_text(text, title)


def render_pdf_from_text(text: str, title: str) -> bytes:
    """Render plain text content into a PDF byte string."""

    if text is None:
        raise ValueError("text must not be None")

    normalised = text.strip("\n")
    if not normalised:
        raise ValueError("text must not be empty")

    wrapped_lines = _wrap_lines(normalised.splitlines())
    pages = _paginate(wrapped_lines)
    return _build_pdf(pages, title=title)


def _wrap_lines(lines: Iterable[str]) -> List[str]:
    wrapper = textwrap.TextWrapper(
        width=MAX_CHARS_PER_LINE,
        break_long_words=True,
        drop_whitespace=False,
        replace_whitespace=False,
    )
    wrapped: List[str] = []
    for line in lines:
        if line == "":
            wrapped.append("")
            continue
        segments = wrapper.wrap(line)
        if not segments:
            wrapped.append("")
        else:
            wrapped.extend(segment.rstrip() for segment in segments)
    return wrapped


def _paginate(lines: Iterable[str]) -> List[List[str]]:
    pages: List[List[str]] = []
    current: List[str] = []
    for line in lines:
        if len(current) >= LINES_PER_PAGE:
            pages.append(current)
            current = []
        current.append(line)
    if current:
        pages.append(current)
    return pages or [[]]


def _build_pdf(pages: List[List[str]], *, title: str | None = None) -> bytes:
    objects: List[bytes | None] = [None]  # object 0 is the free object

    def reserve_object() -> int:
        objects.append(None)
        return len(objects) - 1

    def set_object(object_id: int, payload: bytes) -> None:
        if not payload.endswith(b"\n"):
            payload += b"\n"
        objects[object_id] = payload

    catalog_object_id = reserve_object()
    pages_object_id = reserve_object()
    page_object_ids = [reserve_object() for _ in pages]
    content_object_ids = [reserve_object() for _ in pages]
    font_object_id = reserve_object()
    info_object_id = reserve_object() if title else None

    for object_id, page_lines in zip(content_object_ids, pages):
        stream_bytes = _build_page_stream(page_lines)
        payload = (
            f"<< /Length {len(stream_bytes)} >>\nstream\n".encode("utf-8")
            + stream_bytes
            + b"\nendstream\n"
        )
        set_object(object_id, payload)

    set_object(font_object_id, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    media_box = f"[0 0 {PAGE_WIDTH} {PAGE_HEIGHT}]"
    for page_id, content_id in zip(page_object_ids, content_object_ids):
        payload = (
            b"<< /Type /Page "
            + f"/Parent {pages_object_id} 0 R /MediaBox {media_box} ".encode("utf-8")
            + f"/Contents {content_id} 0 R ".encode("utf-8")
            + f"/Resources << /Font << /F1 {font_object_id} 0 R >> >> >>".encode("utf-8")
        )
        set_object(page_id, payload)

    kids = " ".join(f"{obj_id} 0 R" for obj_id in page_object_ids)
    set_object(
        pages_object_id,
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_ids)} >>".encode("utf-8"),
    )

    set_object(
        catalog_object_id,
        f"<< /Type /Catalog /Pages {pages_object_id} 0 R >>".encode("utf-8"),
    )

    if info_object_id is not None and title:
        safe_title = _escape_pdf_string(title)
        set_object(info_object_id, f"<< /Title ({safe_title}) >>".encode("utf-8"))

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    buffer = bytearray(header)
    offsets: List[int] = []

    for object_id, payload in enumerate(objects[1:], start=1):
        if payload is None:
            raise ValueError(f"PDF object {object_id} was not initialised")
        offsets.append(len(buffer))
        buffer.extend(f"{object_id} 0 obj\n".encode("utf-8"))
        buffer.extend(payload)
        buffer.extend(b"endobj\n")

    xref_offset = len(buffer)
    total_objects = len(objects)
    buffer.extend(f"xref\n0 {total_objects}\n".encode("ascii"))
    buffer.extend(b"0000000000 65535 f \n")
    for offset in offsets:
        buffer.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    trailer_parts = [f"/Size {total_objects}", f"/Root {catalog_object_id} 0 R"]
    if info_object_id is not None:
        trailer_parts.append(f"/Info {info_object_id} 0 R")
    trailer_body = " ".join(trailer_parts)
    buffer.extend(f"trailer\n<< {trailer_body} >>\nstartxref\n".encode("ascii"))
    buffer.extend(f"{xref_offset}".encode("ascii"))
    buffer.extend(b"\n%%EOF")

    return bytes(buffer)


def _escape_pdf_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_page_stream(lines: List[str]) -> bytes:
    start_y = PAGE_HEIGHT - MARGIN
    commands: List[str] = ["BT", "/F1 12 Tf", f"{MARGIN} {start_y} Td"]
    for index, line in enumerate(lines):
        if index > 0:
            commands.append(f"0 -{LINE_HEIGHT} Td")
        safe_line = _escape_pdf_string(line)
        commands.append(f"({safe_line}) Tj")
    commands.append("ET")
    return "\n".join(commands).encode("utf-8")

