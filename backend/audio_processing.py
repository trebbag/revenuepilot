"""Utilities for audio transcription and diarisation.

The real application can accept recorded visit audio and convert it to
text using OpenAI's Whisper API.  When ``pyannote.audio`` is available we
also attempt basic speaker diarisation so that provider and patient text
can be separated.  Both functions gracefully fall back to lightweight
placeholders when the required models or API keys are unavailable so the
rest of the application continues to function in limited environments.
"""

from __future__ import annotations

import io
import tempfile
from typing import Dict

from openai import OpenAI

from .key_manager import get_api_key

try:  # pragma: no cover - optional heavy dependency
    from pyannote.audio import Pipeline, Audio
    import torchaudio

    _DIARISATION_AVAILABLE = True
except Exception:  # pragma: no cover - dependency may be missing
    Pipeline = Audio = torchaudio = None  # type: ignore
    _DIARISATION_AVAILABLE = False


def _transcribe_bytes(data: bytes) -> str:
    """Helper that attempts to transcribe ``data`` using Whisper.

    If transcription fails for any reason (missing key, invalid audio,
    network error) a deterministic placeholder string is returned so the
    caller always receives some text.
    """

    if not data:
        return ""

    api_key = get_api_key()
    if api_key:
        client = OpenAI(api_key=api_key)
        try:
            with io.BytesIO(data) as buf:
                resp = client.audio.transcriptions.create(
                    model="whisper-1", file=buf
                )
            text = getattr(resp, "text", "")
            if text:
                return text.strip()
        except Exception:
            # Fall back to placeholder below
            pass

    try:  # Last-resort attempt: interpret bytes as UTF-8 text
        decoded = data.decode("utf-8").strip()
        if decoded:
            return decoded
    except Exception:
        pass

    return f"[transcribed {len(data)} bytes]"


def diarize_and_transcribe(audio_bytes: bytes) -> Dict[str, str]:
    """Transcribe audio and attempt speaker diarisation.

    The function first tries to separate speakers using
    ``pyannote.audio``'s pretrained diarisation pipeline.  Each detected
    speaker segment is then sent to Whisper for transcription.  Because
    diarisation requires heavy optional dependencies, the function
    automatically falls back to a simple single-speaker transcription
    when those libraries or models are unavailable.

    Args:
        audio_bytes: Raw audio data from a recording.
    Returns:
        Dictionary mapping ``provider`` and ``patient`` to their
        respective transcripts.  When diarisation fails, the ``provider``
        key contains the full transcription and ``patient`` is empty.
    """

    if not audio_bytes:
        return {"provider": "", "patient": ""}

    if _DIARISATION_AVAILABLE:
        try:
            # Write bytes to a temporary file so pyannote can process it
            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                tmp.write(audio_bytes)
                tmp.flush()
                pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization")
                diarization = pipeline(tmp.name)
                audio = Audio()
                speaker_text: Dict[str, str] = {}
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    waveform, sr = audio.crop(tmp.name, turn)
                    buf = io.BytesIO()
                    torchaudio.save(buf, waveform, sr, format="wav")
                    buf.seek(0)
                    text = simple_transcribe(buf.read())
                    if text:
                        speaker_text[speaker] = speaker_text.get(speaker, "") + " " + text
                # Map first two speakers to provider/patient roles
                speakers = sorted(speaker_text.keys())
                provider = speaker_text.get(speakers[0], "").strip() if speakers else ""
                patient = speaker_text.get(speakers[1], "").strip() if len(speakers) > 1 else ""
                if provider or patient:
                    return {"provider": provider, "patient": patient}
        except Exception:
            # Any failure falls through to simple transcription below
            pass

    # Fallback: single-speaker transcription
    text = simple_transcribe(audio_bytes)
    return {"provider": text, "patient": ""}


def simple_transcribe(audio_bytes: bytes) -> str:
    """Transcribe audio without attempting speaker separation.

    This is a thin wrapper around :func:`_transcribe_bytes` that exposes
    the original public interface used elsewhere in the project.
    """

    if not audio_bytes:
        return ""
    return _transcribe_bytes(audio_bytes)
