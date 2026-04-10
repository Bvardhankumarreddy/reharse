from fastapi import APIRouter, HTTPException

from ..config import settings
from ..models.schemas import JDMatchRequest, JDMatchResponse
from ..services.claude import complete_json

router = APIRouter()

_SYSTEM = """You are an expert resume and job-description analyst.
Given a job description and optionally a resume, you:
1. Extract the key technical and soft-skill keywords from the JD.
2. Check which keywords appear in the resume (if provided).
3. Return a structured JSON analysis.

Respond ONLY with valid JSON matching this exact schema:
{
  "match_score": <int 0-100>,
  "matched_keywords": [<string>, ...],
  "missing_keywords": [<string>, ...],
  "strengths": [<string>, ...],
  "gaps": [<string>, ...],
  "recommendations": [<string>, ...],
  "summary": "<string>"
}

Rules:
- match_score: percentage of JD keywords found in resume (0 if no resume provided).
- matched_keywords: up to 15 key terms found in both JD and resume.
- missing_keywords: up to 15 important JD terms absent from resume.
- strengths: 2-4 bullets on where the candidate's background aligns well.
- gaps: 2-4 bullets on the biggest gaps between the JD requirements and resume.
- recommendations: 3-5 concrete, actionable resume improvements.
- summary: 2-3 sentence executive summary of the match.
If no resume is provided, matched_keywords and strengths should be empty, and analyze only the JD keywords."""


@router.post("", response_model=JDMatchResponse)
async def analyze_jd(req: JDMatchRequest) -> JDMatchResponse:
    resume_section = (
        f"\n\n## Candidate Resume\n{req.resume_text}"
        if req.resume_text
        else "\n\n## Candidate Resume\n(No resume provided — analyse JD keywords only)"
    )

    user_message = (
        f"## Job Description\n{req.job_description}"
        f"{resume_section}"
    )

    try:
        result = await complete_json(
            model=settings.model_resume,  # haiku — fast + cheap for keyword extraction
            system=_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=2048,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    return JDMatchResponse(**result)
