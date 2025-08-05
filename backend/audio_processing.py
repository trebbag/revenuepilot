"""
Placeholder functions for audio transcription and speaker diarisation.

RevenuePilot may eventually support uploading or recording visit audio and
extracting separate transcripts for the provider and patient.  Full
implementation requires external libraries and models (e.g. pyannote.audio
for speaker diarisation and OpenAI Whisper for transcription).  Because
those dependencies cannot be installed in this environment, these
functions act as stubs.  They show the expected interface and return
empty transcripts.  Replace the bodies with calls to your chosen
speech‑to‑text and speaker separation services.
"""

from typing import Dict, Tuple


def diarize_and_transcribe(audio_bytes: bytes) -> Dict[str, str]:
    """
    Separate speakers and transcribe the audio.  The returned dictionary
    should map speaker roles (e.g. "provider", "patient") to their
    respective transcripts.  In this stub implementation, both
    transcripts are empty.  In production, you could use a library
    like pyannote.audio to segment the audio by speaker and then feed
    each segment into a transcription model like OpenAI Whisper or
    Google Cloud Speech‑to‑Text.

    Args:
        audio_bytes: Raw audio data (e.g. from a WebM or WAV file).
    Returns:
        A dictionary with keys 'provider' and 'patient' containing
        transcribed text.
    """
    # TODO: implement diarisation and transcription
    return {"provider": "", "patient": ""}


def simple_transcribe(audio_bytes: bytes) -> str:
    """Transcribe audio without speaker separation.

    The real project will eventually call out to a speech‑to‑text
    service such as OpenAI Whisper.  In the test environment we do not
    have access to those heavy dependencies, but the function should
    still return *some* text so the rest of the pipeline can proceed.

    This lightweight implementation attempts to decode the provided
    bytes as UTF‑8.  If that yields no readable characters it falls
    back to returning a deterministic placeholder string containing the
    byte length.  This keeps the function side‑effect free while
    ensuring callers always receive non‑empty text when audio is
    supplied.

    Args:
        audio_bytes: Raw audio data.

    Returns:
        A single string containing the "transcribed" audio or a
        placeholder message when decoding fails.
    """
    if not audio_bytes:
        return ""

    try:
        decoded = audio_bytes.decode("utf-8").strip()
        if decoded:
            return decoded
    except Exception:
        # Decoding can fail for arbitrary byte sequences.  Swallow the
        # error and fall back to a deterministic placeholder.
        pass

    return f"[transcribed {len(audio_bytes)} bytes]"
