from fastapi import APIRouter, HTTPException

from ..config import settings
from ..models.schemas import EvaluateRequest, EvaluateResponse, QuestionFeedback, NextStep
from ..services.claude import complete_json
from ..prompts import evaluator as eval_prompts

router = APIRouter()


@router.post("", response_model=EvaluateResponse)
async def evaluate_session(req: EvaluateRequest) -> EvaluateResponse:
    if not req.transcript:
        raise HTTPException(status_code=422, detail="Transcript must contain at least one Q&A")

    transcript_dicts = [
        {
            "question_id": item.question_id,
            "question":    item.question,
            "answer":      item.answer,
        }
        for item in req.transcript
    ]

    user_prompt = eval_prompts.build_user_prompt(
        interview_type=req.context.interview_type.value,
        role=req.context.target_role,
        company=req.context.target_company,
        level=req.context.experience_level,
        transcript=transcript_dicts,
        user_history=req.user_history,
    )

    try:
        data = await complete_json(
            model=settings.model_evaluator,
            system=eval_prompts.SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=8192,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    question_feedback = [
        QuestionFeedback(
            question_id=qf["question_id"],
            question=qf["question"],
            answer=qf["answer"],
            score=qf["score"],
            strengths=qf.get("strengths", []),
            improvements=qf.get("improvements", []),
            model_answer=qf.get("model_answer"),
        )
        for qf in data.get("question_feedback", [])
    ]

    next_steps = [
        NextStep(
            type=ns["type"],
            title=ns["title"],
            description=ns["description"],
            link=ns.get("link"),
        )
        for ns in data.get("next_steps", [])
    ]

    return EvaluateResponse(
        session_id=req.session_id,
        overall_score=data["overall_score"],
        dimension_scores=data["dimension_scores"],
        summary=data["summary"],
        question_feedback=question_feedback,
        next_steps=next_steps,
        weak_areas=data.get("weak_areas", []),
        model_used=settings.model_evaluator,
    )
