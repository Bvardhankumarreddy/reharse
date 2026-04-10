"""
POST /voice/transcribe
Accepts a binary audio upload (webm/ogg/wav) and returns a text transcript.

When OPENAI_API_KEY is configured, the audio is transcribed using OpenAI Whisper.
Otherwise returns an empty transcript so the interview can continue gracefully
(user can type their answer instead).
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import httpx

from ..config import settings

router = APIRouter()

WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions"
MAX_BYTES   = 25 * 1024 * 1024   # Whisper limit: 25 MB


class TranscribeResponse(BaseModel):
    transcript: str
    language:   str | None = None
    duration:   float | None = None


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(file: UploadFile = File(...)) -> TranscribeResponse:
    raw = await file.read()

    if len(raw) == 0:
        return TranscribeResponse(transcript="")

    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 25 MB)")

    # ── Without OpenAI key: return empty transcript gracefully ───────────────
    if not settings.openai_api_key:
        return TranscribeResponse(transcript="")

    # ── With OpenAI key: call Whisper ────────────────────────────────────────
    content_type  = file.content_type or "audio/webm"
    filename      = file.filename or "audio.webm"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                WHISPER_URL,
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                files={"file": (filename, raw, content_type)},
                data={"model": "whisper-1", "response_format": "verbose_json"},
            )

        if response.status_code != 200:
            # Log and fall back to empty rather than hard-failing the interview
            return TranscribeResponse(transcript="")

        data = response.json()
        return TranscribeResponse(
            transcript=data.get("text", "").strip(),
            language=data.get("language"),
            duration=data.get("duration"),
        )

    except httpx.RequestError:
        # Network error — don't crash the interview
        return TranscribeResponse(transcript="")
