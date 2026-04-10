import io

from fastapi import APIRouter, HTTPException, UploadFile, File
from pypdf import PdfReader

from ..config import settings
from ..models.schemas import ResumeParseResponse
from ..services.claude import complete_json
from ..prompts.coach import RESUME_PARSE_SYSTEM, RESUME_PARSE_PROMPT

router = APIRouter()

MAX_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/parse", response_model=ResumeParseResponse)
async def parse_resume(file: UploadFile = File(...)) -> ResumeParseResponse:
    if file.content_type not in ("application/pdf",):
        raise HTTPException(status_code=415, detail="Only PDF files are supported")

    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    # Extract text from PDF
    try:
        reader = PdfReader(io.BytesIO(raw))
        text   = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}") from e

    if not text:
        raise HTTPException(status_code=422, detail="PDF contained no extractable text")

    # Truncate to ~8k chars to stay within context limits for haiku
    truncated = text[:8000]

    try:
        data = await complete_json(
            model=settings.model_resume,
            system=RESUME_PARSE_SYSTEM,
            messages=[{"role": "user", "content": RESUME_PARSE_PROMPT.format(resume_text=truncated)}],
            max_tokens=1024,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    return ResumeParseResponse(
        raw_text=truncated,
        target_role=data.get("target_role"),
        experience_level=data.get("experience_level"),
        skills=data.get("skills", []),
        companies=data.get("companies", []),
        summary=data.get("summary", ""),
    )
