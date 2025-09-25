"""Utilities for rendering finalized notes into PDF byte streams."""

from __future__ import annotations

import json
from typing import Any, Iterable

__all__ = ["render_note_pdf", "render_summary_pdf"]


def render_note_pdf(note: str) -> bytes:
    """Render the supplied note body into a minimal PDF document."""

    if note is None or note.strip() == "":
        raise ValueError("note content must be a non-empty string")

    return _text_to_pdf(note)


def render_summary_pdf(summary: Any) -> bytes:
    """Render a finalized summary payload into a PDF document."""

    text = _normalise_summary(summary)
    if text.strip() == "":
        raise ValueError("summary payload must not be empty")

    return _text_to_pdf(text)


def _normalise_summary(summary: Any) -> str:
    if summary is None:
        raise ValueError("summary payload must not be empty")

    if isinstance(summary, str):
        return summary

    if isinstance(summary, (dict, list)):
        return json.dumps(summary, indent=2, sort_keys=True)

    return str(summary)


def _text_to_pdf(text: str) -> bytes:
    lines = _prepare_lines(text)
    stream_commands = _build_stream(lines)
    stream_bytes = "\n".join(stream_commands).encode("utf-8")

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n"
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
            b"endobj\n"
        ),
        (f"4 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("utf-8")
         + stream_bytes
         + b"\nendstream\nendobj\n"),
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]

    buffer = bytearray()
    buffer.extend(header)
    offsets = []
    for obj in objects:
        offsets.append(len(buffer))
        buffer.extend(obj)

    xref_offset = len(buffer)
    buffer.extend(f"xref\n0 {len(offsets) + 1}\n".encode("ascii"))
    buffer.extend(b"0000000000 65535 f \n")
    for offset in offsets:
        buffer.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    buffer.extend(b"trailer\n<< /Size ")
    buffer.extend(f"{len(offsets) + 1}".encode("ascii"))
    buffer.extend(b" /Root 1 0 R >>\nstartxref\n")
    buffer.extend(f"{xref_offset}".encode("ascii"))
    buffer.extend(b"\n%%EOF")

    return bytes(buffer)


def _prepare_lines(text: str) -> Iterable[str]:
    sanitised = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return sanitised.splitlines() or [sanitised]


def _build_stream(lines: Iterable[str]) -> list[str]:
    commands: list[str] = ["BT", "/F1 12 Tf", "72 720 Td"]
    line_height = 14

    first = True
    for line in lines:
        if not first:
            commands.append(f"0 -{line_height} Td")
        commands.append(f"({line}) Tj")
        first = False

    commands.append("ET")
    return commands
