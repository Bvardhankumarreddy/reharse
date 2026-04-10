from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..config import settings
from ..models.schemas import CoachRequest, CoachResponse
from ..services.claude import complete, stream_text
from ..prompts.coach import build_system

router = APIRouter()


@router.post("", response_model=CoachResponse)
async def chat_with_coach(req: CoachRequest) -> CoachResponse | StreamingResponse:
    system = build_system(req.user_context)
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    if req.stream:
        async def event_stream():
            async for chunk in stream_text(
                model=settings.model_coach,
                system=system,
                messages=messages,
                max_tokens=1024,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    try:
        reply = await complete(
            model=settings.model_coach,
            system=system,
            messages=messages,
            max_tokens=1024,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    # Extract any suggestion bullets from the reply (lines starting with "→" or "•")
    suggestions = [
        line.lstrip("→•- ").strip()
        for line in reply.splitlines()
        if line.strip().startswith(("→", "•", "-"))
    ]

    return CoachResponse(reply=reply, suggestions=suggestions[:3])
