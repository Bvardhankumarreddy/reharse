from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from ..services.claude import complete_json


router = APIRouter()


class JDInterviewPrepRequest(BaseModel):
    job_description: str
    resume_text: str | None = None
    interview_type: str = "behavioral"  # behavioral | coding | system-design | hr | case-study | mixed
    num_questions: int = Field(default=5, ge=3, le=15)


class GeneratedJDQuestion(BaseModel):
    question: str
    type: str
    difficulty: str
    rationale: str
    follow_ups: list[str] = []


class JDInterviewPrepResponse(BaseModel):
    target_role: str
    target_company: str | None
    experience_level: str
    summary: str
    focus_areas: list[str]
    questions: list[GeneratedJDQuestion]


_SYSTEM = """You are an expert technical recruiter and interview designer.
Given a job description and optionally a candidate's resume, you create
a tailored mock-interview question set that targets:
- The specific skills and domains in the JD
- The seniority level the JD implies
- The candidate's existing strengths AND gaps (when resume is provided)

Always respond with valid JSON only — no prose, no markdown fences."""


def _prompt(req: JDInterviewPrepRequest) -> str:
    resume_block = (
        f"\n\n## Candidate Resume (use to tailor difficulty + reference real experience)\n{req.resume_text}"
        if req.resume_text
        else "\n\n## Candidate Resume\n(No resume provided — use JD only.)"
    )
    interview_filter = (
        "Mix interview types appropriately for the role"
        if req.interview_type == "mixed"
        else f"Focus all questions on the {req.interview_type} interview type"
    )
    return f"""## Job Description
{req.job_description}{resume_block}

## Task
Generate exactly {req.num_questions} interview questions that an experienced interviewer would ask
a candidate applying to this role. {interview_filter}.

For each question, briefly explain WHY you chose it (the rationale must reference a specific
requirement in the JD or a gap/strength in the resume).

Respond with JSON matching this exact schema:
{{
  "target_role": "<role title extracted from the JD>",
  "target_company": "<company name extracted from the JD, or null>",
  "experience_level": "<Entry-level | Mid-level | Senior | Staff/Principal>",
  "summary": "<2-3 sentence overview of the role and what's being tested>",
  "focus_areas": ["<technical or behavioral focus 1>", "<focus 2>", "<focus 3>"],
  "questions": [
    {{
      "question": "<the interview question>",
      "type": "behavioral|coding|system-design|hr|case-study",
      "difficulty": "easy|medium|hard",
      "rationale": "<why this question for this candidate + this JD>",
      "follow_ups": ["<follow-up 1>", "<follow-up 2>"]
    }}
  ]
}}
"""


@router.post("", response_model=JDInterviewPrepResponse)
async def prepare_from_jd(req: JDInterviewPrepRequest) -> JDInterviewPrepResponse:
    if not req.job_description or len(req.job_description.strip()) < 100:
        raise HTTPException(status_code=422, detail="Job description too short (need at least 100 characters)")

    truncated_jd = req.job_description[:8000]
    truncated_resume = req.resume_text[:8000] if req.resume_text else None

    try:
        data = await complete_json(
            model=settings.model_question_gen,  # sonnet — needs to reason about JD + resume + question design
            system=_SYSTEM,
            messages=[{
                "role": "user",
                "content": _prompt(JDInterviewPrepRequest(
                    job_description=truncated_jd,
                    resume_text=truncated_resume,
                    interview_type=req.interview_type,
                    num_questions=req.num_questions,
                )),
            }],
            max_tokens=4096,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    return JDInterviewPrepResponse(
        target_role=data.get("target_role", "Software Engineer"),
        target_company=data.get("target_company"),
        experience_level=data.get("experience_level", "Mid-level"),
        summary=data.get("summary", ""),
        focus_areas=data.get("focus_areas", []),
        questions=[
            GeneratedJDQuestion(
                question=q.get("question", ""),
                type=q.get("type", req.interview_type),
                difficulty=q.get("difficulty", "medium"),
                rationale=q.get("rationale", ""),
                follow_ups=q.get("follow_ups", []),
            )
            for q in data.get("questions", [])
        ],
    )
