"""Generate AetherStackAI social posts via Claude — one platform at a time."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..services.claude import complete

router = APIRouter()


COMMUNITY_LINKS = {
    "youtube":   "youtube.com/@aetherstackai",
    "instagram": "instagram.com/aetherstackai",
    "linkedin":  "linkedin.com/company/115524370",
    "whatsapp":  "whatsapp.com/channel/0029Vb7dRgq1dAwCydDr651d",
    "quiz":      "reharse.inferix.in/quiz",
}


PLATFORM_SPECS: dict[str, dict[str, Any]] = {
    "linkedin_page": {
        "max_chars": 3000, "optimal_chars": 1300,
        "tone": "professional but engaging",
        "hashtags": "3-5 relevant tags",
        "emojis": "moderate (4-6)",
    },
    "linkedin_personal": {
        "max_chars": 3000, "optimal_chars": 1500,
        "tone": "personal, founder voice — first person",
        "hashtags": "3-5 relevant tags",
        "emojis": "moderate (4-6)",
    },
    "instagram_feed": {
        "max_chars": 2200, "optimal_chars": 1500,
        "tone": "energetic, hook-driven, scannable",
        "hashtags": "10-15 hashtags at the END of the post",
        "emojis": "heavy",
    },
    "instagram_story": {
        "max_chars": 600,
        "tone": "frame-by-frame text — output as 'FRAME 1:', 'FRAME 2:' (max 5 frames)",
        "hashtags": "none",
        "emojis": "heavy",
    },
    "whatsapp_status": {
        "max_chars": 700, "max_lines": 10,
        "tone": "punchy, casual, mobile-first",
        "hashtags": "none",
        "emojis": "moderate",
    },
    "youtube_community": {
        "max_chars": 1500,
        "tone": "direct, community-focused, end with a question",
        "hashtags": "none",
        "emojis": "moderate",
    },
}


class GenerateRequest(BaseModel):
    platform: str
    content_type: str
    context: dict[str, Any]


class GenerateResponse(BaseModel):
    text: str
    model: str


_SYSTEM = """You are a social media copywriter for AetherStackAI — a YouTube channel teaching AI to beginners.
Your style is: clear, energetic, no jargon, mobile-first.
Output ONLY the post text. No preamble, no explanation, no quotation marks wrapping the post."""


def _build_prompt(content_type: str, platform: str, context: dict[str, Any]) -> str:
    spec = PLATFORM_SPECS.get(platform)
    if not spec:
        raise ValueError(f"Unknown platform: {platform}")

    spec_lines = [f"- {k}: {v}" for k, v in spec.items()]
    spec_block = "\n".join(spec_lines)

    common_links = (
        f"\n- YouTube: {COMMUNITY_LINKS['youtube']}"
        f"\n- Instagram: {COMMUNITY_LINKS['instagram']}"
    )
    if "linkedin" in platform:
        common_links += f"\n- WhatsApp Channel: {COMMUNITY_LINKS['whatsapp']}"

    if content_type == "lesson_drop":
        c = context
        next_lesson = (
            f"\n- Next lesson ({c.get('nextLessonDay', 'Thursday')}): {c.get('nextLessonTitle')}"
            if c.get("nextLessonTitle") else ""
        )
        insight = f"\n- Personal insight to weave in: {c.get('insight')}" if c.get("insight") else ""
        return f"""Generate a {platform} post announcing a NEW LESSON.

LESSON CONTEXT:
- Week: {c.get('week')}
- Lesson #: {c.get('lessonNum')}
- Title: "{c.get('title')}"
- Hook/Summary: {c.get('hook')}
- YouTube link: {c.get('youtubeLink', '[link]')}
- Duration: {c.get('duration', 7)} minutes{next_lesson}{insight}

PLATFORM REQUIREMENTS:
{spec_block}

INCLUDE THESE LINKS:{common_links}

REQUIREMENTS:
1. STRONG hook in the first line (especially first 3 words)
2. Mention what makes this lesson valuable
3. Include the YouTube link
4. Subtle CTA: subscribe + Saturday quiz at {COMMUNITY_LINKS['quiz']}
5. Authentic voice, not corporate
{('6. MUST be under 700 chars AND under 10 lines.' if platform == 'whatsapp_status' else '')}
{('6. End with 10-15 relevant hashtags.' if platform == 'instagram_feed' else '')}
"""

    if content_type == "quiz_winners":
        c = context
        winners = c.get("winners") or []
        w1 = winners[0] if len(winners) > 0 else {}
        w2 = winners[1] if len(winners) > 1 else {}
        w3 = winners[2] if len(winners) > 2 else {}
        next_week = (int(c.get("week", 0)) or 0) + 1
        return f"""Generate a {platform} post announcing QUIZ #{c.get('week')} WINNERS.

QUIZ CONTEXT:
- Week: {c.get('week')}
- Total participants: {c.get('totalParticipants', '—')}
- 1st: {w1.get('name', '—')} ({w1.get('score', '—')} in {w1.get('time', '—')})
- 2nd: {w2.get('name', '—')} ({w2.get('score', '—')} in {w2.get('time', '—')})
- 3rd: {w3.get('name', '—')} ({w3.get('score', '—')} in {w3.get('time', '—')})
- Next quiz: {c.get('nextQuizDay', 'Saturday')} (Quiz #{next_week})

PLATFORM REQUIREMENTS:
{spec_block}

INCLUDE THESE LINKS:{common_links}
- Quiz: {COMMUNITY_LINKS['quiz']}

REQUIREMENTS:
1. Celebrate winners by name
2. Highlight any interesting stat (close finish, perfect score, fastest time)
3. Mention "prizes delivered" — DO NOT specify exact amounts publicly
4. Tease next quiz on {c.get('nextQuizDay', 'Saturday')}
5. Authentic, congratulatory tone
{('6. MUST be under 700 chars AND under 10 lines.' if platform == 'whatsapp_status' else '')}
{('6. End with 10-15 relevant hashtags.' if platform == 'instagram_feed' else '')}
"""

    if content_type == "quiz_announcement":
        c = context
        return f"""Generate a {platform} post ANNOUNCING this week's quiz.

QUIZ CONTEXT:
- Week: {c.get('week')}
- Date: {c.get('quizDay', 'Saturday')}
- Time: {c.get('quizTime', '8 PM IST')}
- Prizes: Top 3 win cash (don't specify amounts publicly)
- URL: {COMMUNITY_LINKS['quiz']}

PLATFORM REQUIREMENTS:
{spec_block}

INCLUDE THESE LINKS:{common_links}
- Quiz: {COMMUNITY_LINKS['quiz']}

REQUIREMENTS:
1. Build urgency / excitement
2. Include exact day + time
3. Clear CTA: visit {COMMUNITY_LINKS['quiz']}
{('4. MUST be under 700 chars AND under 10 lines.' if platform == 'whatsapp_status' else '')}
{('4. End with 10-15 relevant hashtags.' if platform == 'instagram_feed' else '')}
"""

    if content_type == "engagement_post":
        c = context
        return f"""Generate a {platform} ENGAGEMENT post — designed to start a conversation.

TOPIC: {c.get('topic', 'AI fundamentals')}
ANGLE: {c.get('angle', 'Ask the audience to share their take')}

PLATFORM REQUIREMENTS:
{spec_block}

INCLUDE THESE LINKS:{common_links}

REQUIREMENTS:
1. Open with a hot take, hook, or question
2. Make it easy to comment/reply (1-line response is fine)
3. Soft mention of the channel — no hard sell
{('4. MUST be under 700 chars AND under 10 lines.' if platform == 'whatsapp_status' else '')}
"""

    if content_type == "custom":
        c = context
        return f"""Generate a {platform} post with this brief:

BRIEF: {c.get('brief', '(no brief provided)')}

PLATFORM REQUIREMENTS:
{spec_block}

INCLUDE THESE LINKS:{common_links}
"""

    raise ValueError(f"Unsupported contentType: {content_type}")


@router.post("/generate", response_model=GenerateResponse)
async def generate_post(req: GenerateRequest) -> GenerateResponse:
    if req.platform not in PLATFORM_SPECS:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {req.platform}")

    try:
        prompt = _build_prompt(req.content_type, req.platform, req.context)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        text = await complete(
            model=settings.model_coach,
            system=_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
            temperature=0.9,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    return GenerateResponse(text=text.strip(), model=settings.model_coach)
