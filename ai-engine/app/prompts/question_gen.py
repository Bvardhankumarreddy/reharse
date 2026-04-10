from __future__ import annotations

SYSTEM = """\
You are an expert technical interviewer with 15+ years of experience at top tech companies (Google, Meta, Amazon, Apple, Microsoft).
Your job is to generate realistic, high-quality interview questions tailored to the candidate's role, experience, and target company.

Guidelines:
- Match the real format used at the specified company (e.g. Google uses Leadership Principles, Amazon uses LP stories)
- Calibrate difficulty to experience level — entry-level questions should have clear scope, senior questions should require deep expertise
- Include practical follow-ups that a real interviewer would ask
- For behavioral: use STAR-format prompts
- For coding: include constraints and example I/O
- For system design: scope the problem appropriately for the time limit
- Always respond with valid JSON only — no prose, no markdown fences
"""


def build_user_prompt(
    interview_type: str,
    role: str,
    company: str | None,
    level: str,
    num: int,
    difficulty: str,
    resume_context: str | None,
    previous_qa: list[dict] | None = None,
    user_history: dict | None = None,
) -> str:
    company_line = f"Target company: {company}" if company else "No specific company (use generic best practices)"
    resume_line  = f"\nCandidate resume summary:\n{resume_context}" if resume_context else ""

    # Build candidate history block from aggregated past sessions
    history_block = ""
    if user_history:
        parts: list[str] = []
        scores = user_history.get("recentScores") or []
        if scores:
            avg = sum(scores) / len(scores)
            parts.append(f"Average score across last {len(scores)} session(s): {avg:.0f}/100")
        if user_history.get("weakAreas"):
            parts.append(f"Recurring weak areas: {', '.join(user_history['weakAreas'])}")
        if user_history.get("recurringFeedback"):
            parts.append(f"Repeated improvement notes: {'; '.join(user_history['recurringFeedback'])}")
        if parts:
            history_block = (
                "\nCandidate history (use to personalise difficulty and topic selection):\n"
                + "\n".join(f"- {p}" for p in parts)
                + "\nTarget questions at the weak areas above and avoid topics the candidate has already mastered.\n"
            )

    # Build the conversation history section for adaptive generation
    if previous_qa:
        history_lines = "\n".join(
            f"Q{i+1}: {qa['question']}\nA{i+1}: {qa['answer'][:400]}{'...' if len(qa['answer']) > 400 else ''}"
            for i, qa in enumerate(previous_qa)
        )
        history_section = f"""
Interview so far (do NOT repeat these questions or topics already covered):
{history_lines}

Based on the candidate's answers above, generate {num} adaptive follow-up question(s) that:
- Probe areas where the answer was vague, shallow, or could be expanded
- Explore related behavioural competencies not yet covered
- Feel natural as the next question a real interviewer would ask
- Are NOT repetitions of anything above
"""
    else:
        history_section = f"Generate {num} {interview_type} interview question(s) to start the session."

    return f"""\
{history_section}

Role: {role}
Experience level: {level}
{company_line}
Difficulty: {difficulty}{resume_line}{history_block}

Return a JSON object with this exact shape:
{{
  "questions": [
    {{
      "id": "<uuid-v4>",
      "question": "<full question text>",
      "type": "{interview_type}",
      "difficulty": "{difficulty}",
      "tags": ["<tag1>", "<tag2>"],
      "follow_ups": ["<follow-up 1>", "<follow-up 2>"],
      "hints": ["<hint 1>"],
      "time_estimate_seconds": <int>
    }}
  ],
  "session_tip": "<one short coaching tip for this interview type>"
}}
"""
