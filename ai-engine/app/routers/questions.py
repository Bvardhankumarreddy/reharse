import uuid

from fastapi import APIRouter, HTTPException

from ..config import settings
from ..models.schemas import GenerateQuestionsRequest, GenerateQuestionsResponse, GeneratedQuestion
from ..services.claude import complete_json
from ..prompts import question_gen as qg_prompts

router = APIRouter()


@router.post("", response_model=GenerateQuestionsResponse)
async def generate_questions(req: GenerateQuestionsRequest) -> GenerateQuestionsResponse:
    previous_qa = (
        [{"question": qa.question, "answer": qa.answer} for qa in req.previous_qa]
        if req.previous_qa
        else None
    )

    user_prompt = qg_prompts.build_user_prompt(
        interview_type=req.interview_type.value,
        role=req.target_role,
        company=req.target_company,
        level=req.experience_level,
        num=req.num_questions,
        difficulty=req.difficulty.value,
        resume_context=req.resume_context,
        previous_qa=previous_qa,
        user_history=req.user_history,
    )

    try:
        data = await complete_json(
            model=settings.model_question_gen,
            system=qg_prompts.SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=4096,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    questions = [
        GeneratedQuestion(
            id=q.get("id") or str(uuid.uuid4()),
            question=q["question"],
            type=req.interview_type,
            difficulty=req.difficulty,
            tags=q.get("tags", []),
            follow_ups=q.get("follow_ups", []),
            hints=q.get("hints", []),
            time_estimate_seconds=q.get("time_estimate_seconds", 120),
        )
        for q in data.get("questions", [])
    ]

    return GenerateQuestionsResponse(
        questions=questions,
        session_tip=data.get("session_tip"),
    )
