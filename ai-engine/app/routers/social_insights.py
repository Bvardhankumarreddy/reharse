"""Generate actionable insights from 30 days of social-engagement data."""
from __future__ import annotations

import json
from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..services.claude import complete

router = APIRouter()


class InsightsRequest(BaseModel):
    period_days: int = 30
    summary: dict[str, Any]


class Insight(BaseModel):
    type: str  # best_time | best_hashtags | top_content | underperforming | platform_recommendation
    platform: str | None = None
    finding: str
    recommendation: str
    confidence: float


class InsightsResponse(BaseModel):
    insights: list[Insight]
    model: str


_SYSTEM = """You are a senior social-media analyst for AetherStackAI, an AI-education YouTube channel.
You analyse engagement data and produce a small number of HIGH-CONFIDENCE, SPECIFIC insights.
Never invent metrics — only refer to numbers visible in the input.
Output STRICTLY valid JSON — no preamble, no markdown."""


@router.post("/generate", response_model=InsightsResponse)
async def generate_insights(req: InsightsRequest) -> InsightsResponse:
    if not req.summary:
        raise HTTPException(status_code=422, detail="summary is required")

    summary_json = json.dumps(req.summary, indent=2, default=str)
    prompt = f"""Analyse this {req.period_days}-day engagement summary and return 3-5 actionable insights:

{summary_json}

Return JSON of the form:
{{
  "insights": [
    {{
      "type": "best_time" | "best_hashtags" | "top_content" | "underperforming" | "platform_recommendation",
      "platform": "linkedin_page" | "linkedin_personal" | "instagram_feed" | "youtube_community" | "all",
      "finding": "<one specific sentence with numbers from the data>",
      "recommendation": "<one specific action to take>",
      "confidence": <0.0 to 1.0>
    }}
  ]
}}

RULES:
1. Only report patterns the data actually shows. Don't infer beyond the numbers.
2. Each finding must reference concrete numbers (e.g. "2.3x", "47 vs 12", "8 AM IST")
3. Each recommendation must be a SINGLE specific action (e.g. "schedule LinkedIn at 8 AM" not "post more")
4. Confidence: 0.9 = very strong signal (≥10 data points + clear pattern); 0.6 = decent signal; 0.4 = weak/few data points
5. Skip categories where data is too thin — better to return 3 strong insights than 5 weak ones.
6. Use "all" for cross-platform observations only when justified.
"""

    try:
        text = await complete(
            model=settings.model_evaluator,  # opus — analytical task
            system=_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.3,  # low — we want deterministic analysis, not creative writing
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude error: {e}") from e

    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0]

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Could not parse insights JSON: {e}") from e

    raw = data.get("insights", []) if isinstance(data, dict) else data
    insights = [
        Insight(
            type=i.get("type", "underperforming"),
            platform=i.get("platform"),
            finding=i.get("finding", ""),
            recommendation=i.get("recommendation", ""),
            confidence=float(i.get("confidence", 0.5)),
        )
        for i in raw
        if i.get("finding")
    ]

    return InsightsResponse(insights=insights, model=settings.model_evaluator)
