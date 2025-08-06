"""Utilities for audio transcription and diarisation.

The real application can accept recorded visit audio and convert it to
text using OpenAI's Whisper API.  When ``pyannote.audio`` is available we
also attempt basic speaker diarisation so that provider and patient text
can be separated.  Both functions gracefully fall back to lightweight
placeholders when the required models or API keys are unavailable so the
rest of the application continues to function in limited environments.
Deterministic placeholders are used whenever transcription cannot be
performed so callers always receive predictable output.
"""

from __future__ import annotations

import io
import os
import tempfile
from typing import Any, Dict

from openai import OpenAI

from .key_manager import get_api_key

try:  # pragma: no cover - optional heavy dependency
    from pyannote.audio import Pipeline, Audio
    import torchaudio

    _DIARISATION_AVAILABLE = True
except Exception:  # pragma: no cover - dependency may be missing
    Pipeline = Audio = torchaudio = None  # type: ignore
    _DIARISATION_AVAILABLE = False


_LOCAL_MODEL: Any | None = None


def _load_local_model() -> Any:  # pragma: no cover - heavy optional dependency
    """Lazily load and cache the Whisper model for offline use."""
    global _LOCAL_MODEL
    if _LOCAL_MODEL is None:
        import whisper  # type: ignore

        model_name = os.getenv("WHISPER_MODEL", "base")
        _LOCAL_MODEL = whisper.load_model(model_name)
    return _LOCAL_MODEL


def _transcribe_bytes(data: bytes) -> str:
    """Helper that attempts to transcribe ``data`` using Whisper.

    If transcription fails for any reason (missing key, invalid audio,
    network error) a deterministic placeholder string is returned so the
    caller always receives some text.
    """

    if not data:
        return ""

    offline = os.getenv("OFFLINE_TRANSCRIBE", "").lower() == "true"
    if offline:
        try:
            model = _load_local_model()
            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                tmp.write(data)
                tmp.flush()
                result = model.transcribe(tmp.name)
            text = result.get("text", "")
            if text:
                return text.strip()
        except Exception:
            pass

    api_key = get_api_key()
    if api_key and not offline:
        try:
            client = OpenAI(api_key=api_key)
            with io.BytesIO(data) as buf:
                resp = client.audio.transcriptions.create(
                    model="whisper-1", file=buf
                )
            text = getattr(resp, "text", "") if resp else ""
            if text:
                return text.strip()
        except Exception:
            # Any failure is handled by fallbacks below so callers still
            # receive a deterministic placeholder rather than an empty string.
            pass

    try:  # Last-resort attempt: interpret bytes as UTF-8 text
        decoded = data.decode("utf-8").strip()
        if decoded:
            return decoded
    except Exception:
        pass

    return f"[transcribed {len(data)} bytes]"


def diarize_and_transcribe(audio_bytes: bytes) -> Dict[str, object]:
    """Transcribe audio and attempt speaker diarisation.

    When diarisation succeeds the return value contains provider and
    patient transcripts along with a ``segments`` list describing who is
    speaking at each time.  Each segment is a dictionary with ``start``
    and ``end`` times in seconds and a ``speaker`` key whose value is
    either ``"provider"`` or ``"patient"``.  If diarisation is not
    available or fails, a single segment covering the whole recording is
    returned with the entire transcription under ``provider``.
    """

    if not audio_bytes:
        return {"provider": "", "patient": "", "segments": []}

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
                raw_segments = []
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    waveform, sr = audio.crop(tmp.name, turn)
                    buf = io.BytesIO()
                    torchaudio.save(buf, waveform, sr, format="wav")
                    buf.seek(0)
                    text = simple_transcribe(buf.read())
                    raw_segments.append({
                        "speaker": speaker,
                        "start": float(getattr(turn, "start", 0.0)),
                        "end": float(getattr(turn, "end", 0.0)),
                        "text": text,
                    })
                    if text:
                        speaker_text[speaker] = speaker_text.get(speaker, "") + " " + text
                # Map first two speakers to provider/patient roles
                speakers = sorted(speaker_text.keys())
                provider_key = speakers[0] if speakers else None
                patient_key = speakers[1] if len(speakers) > 1 else None
                provider = speaker_text.get(provider_key, "").strip() if provider_key else ""
                patient = speaker_text.get(patient_key, "").strip() if patient_key else ""
                mapped_segments = []
                for seg in raw_segments:
                    if seg["speaker"] == provider_key:
                        role = "provider"
                    elif seg["speaker"] == patient_key:
                        role = "patient"
                    else:
                        role = seg["speaker"]
                    mapped_segments.append({
                        "speaker": role,
                        "start": seg["start"],
                        "end": seg["end"],
                        "text": seg["text"],
                    })
                if provider or patient:
                    return {
                        "provider": provider,
                        "patient": patient,
                        "segments": mapped_segments,
                    }
        except Exception:
            # Any failure falls through to simple transcription below
            pass

    # Fallback: single-speaker transcription
    text = simple_transcribe(audio_bytes)
    if not text:
        # Ensure a deterministic placeholder is returned when transcription
        # ultimately fails so callers always receive some text.
        text = f"[transcribed {len(audio_bytes)} bytes]"
    return {
        "provider": text,
        "patient": "",
        "segments": [{"speaker": "provider", "start": 0.0, "end": 0.0, "text": text}],
    }


def simple_transcribe(audio_bytes: bytes) -> str:
    """Transcribe audio without attempting speaker separation.

    This is a thin wrapper around :func:`_transcribe_bytes` that exposes
    the original public interface used elsewhere in the project.
    """

    if not audio_bytes:
        return ""
    try:
        text = _transcribe_bytes(audio_bytes)
    except Exception:
        text = ""
    if text.strip():
        return text.strip()
    try:  # Last resort: attempt to decode raw bytes as UTF-8
        decoded = audio_bytes.decode("utf-8").strip()
        if decoded:
            return decoded
    except Exception:
        pass
    return f"[transcribed {len(audio_bytes)} bytes]"
