from __future__ import annotations

SYSTEM = """\
You are an expert interview coach and evaluator. Your job is to assess a candidate's interview performance and provide actionable, specific feedback.

Scoring dimensions (0–100):
- communication: Clarity, conciseness, articulation
- structure: Use of frameworks (STAR, etc.), logical flow
- depth: Technical accuracy, completeness, nuance
- examples: Specificity and relevance of real examples given
- confidence: Tone, decisiveness, self-awareness

Be honest but constructive. Identify both strengths and clear improvement areas.
Tailor feedback to the target role and company.
Always respond with valid JSON only — no prose, no markdown fences.
"""


def build_user_prompt(
    interview_type: str,
    role: str,
    company: str | None,
    level: str,
    transcript: list[dict],
    user_history: dict | None = None,
) -> str:
    company_line = f"Target company: {company}" if company else "Generic (no specific company)"
    qa_block = "\n\n".join(
        f"Q{i+1}: {item['question']}\nA{i+1}: {item['answer']}"
        for i, item in enumerate(transcript)
    )

    # Build candidate history block
    history_block = ""
    if user_history:
        parts: list[str] = []
        scores = user_history.get("recentScores") or []
        if scores:
            avg = sum(scores) / len(scores)
            parts.append(f"Historical average score: {avg:.0f}/100 across {len(scores)} past session(s)")
        if user_history.get("weakAreas"):
            parts.append(f"Known weak areas: {', '.join(user_history['weakAreas'])}")
        if user_history.get("recurringFeedback"):
            parts.append(f"Recurring improvement notes from past sessions: {'; '.join(user_history['recurringFeedback'])}")
        if parts:
            history_block = (
                "\n--- Candidate History ---\n"
                + "\n".join(f"- {p}" for p in parts)
                + "\nUse this history to contextualise your evaluation: highlight whether recurring weak areas have improved, and calibrate your feedback accordingly.\n--- End History ---\n"
            )

    return f"""\
Evaluate this {interview_type} interview performance.

Role: {role}
Level: {level}
{company_line}
{history_block}
--- Transcript ---
{qa_block}
--- End Transcript ---

Return a JSON object with this exact shape:
{{
  "overall_score": <int 0-100>,
  "dimension_scores": {{
    "communication": <int>,
    "structure": <int>,
    "depth": <int>,
    "examples": <int>,
    "confidence": <int>
  }},
  "summary": "<2-3 sentence executive summary of performance>",
  "question_feedback": [
    {{
      "question_id": "<id from transcript>",
      "question": "<question text>",
      "answer": "<candidate answer>",
      "score": <int 0-100>,
      "strengths": ["<strength 1>", "<strength 2>"],
      "improvements": ["<improvement 1>", "<improvement 2>"],
      "model_answer": "<brief ideal answer outline>"
    }}
  ],
  "next_steps": [
    {{
      "type": "practice|read|watch",
      "title": "<title>",
      "description": "<1 sentence>",
      "link": null
    }}
  ],
  "weak_areas": ["<area 1>", "<area 2>"]
}}
"""
