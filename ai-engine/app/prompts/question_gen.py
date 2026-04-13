from __future__ import annotations
import random

# Topic seeds per interview type — randomly selected when no previous_qa exists
# so Q1 varies meaningfully across sessions with the same parameters.
_TOPIC_SEEDS: dict[str, list[str]] = {
    "behavioral": [
        "leadership and influence on a team",
        "conflict resolution with a colleague or stakeholder",
        "handling failure or a significant setback",
        "delivering results under a tight deadline",
        "taking initiative or ownership on a project",
        "cross-functional collaboration and communication",
        "navigating ambiguity without a clear roadmap",
        "giving or receiving constructive feedback",
        "mentoring or growing others",
        "adapting to unexpected change",
    ],
    "coding": [
        "arrays or string manipulation",
        "tree or graph traversal",
        "dynamic programming or memoization",
        "recursion and backtracking",
        "hash maps and frequency counting",
        "sliding window or two-pointer approach",
        "sorting, searching, or binary search",
        "stack or queue-based problems",
    ],
    "system-design": [
        "horizontal scaling and load balancing",
        "database design and indexing strategy",
        "caching layers and cache invalidation",
        "REST or GraphQL API design",
        "microservices decomposition and trade-offs",
        "real-time event-driven or pub-sub architecture",
        "message queues and async job processing",
        "authentication, authorisation, and token management at scale",
    ],
    "hr": [
        "long-term career goals and motivation",
        "greatest professional strength and how you apply it",
        "an area for growth and how you address it",
        "what you look for in a team or company culture",
        "how you handle competing priorities",
    ],
    "case-study": [
        "market sizing and estimation",
        "product prioritisation and trade-offs",
        "go-to-market strategy for a new feature",
        "diagnosing a drop in a key metric",
        "competitive positioning",
    ],
}

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
    past_questions_block = ""
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
        # Cross-session question deduplication
        prev_qs = user_history.get("previouslyAskedQuestions") or []
        if prev_qs:
            listed = "\n".join(f"- {q}" for q in prev_qs[:50])
            past_questions_block = (
                f"\nQuestions already asked in previous sessions (do NOT repeat or paraphrase any of these):\n"
                + listed
                + "\n"
            )

    # Build the conversation history section for adaptive generation
    if previous_qa:
        history_lines = "\n".join(
            f"Q{i+1}: {qa['question']}\n"
            + (
                f"A{i+1}: [candidate is currently answering — choose a DIFFERENT topic/competency]"
                if qa["answer"] in ("[ANSWERING]", "[PASSED]")
                else f"A{i+1}: {qa['answer'][:400]}{'...' if len(qa['answer']) > 400 else ''}"
            )
            for i, qa in enumerate(previous_qa)
        )
        history_section = f"""
Interview so far (do NOT repeat these questions or topics already covered):
{history_lines}

Based on the candidate's responses above, generate {num} adaptive follow-up question(s) that:
- Cover a DIFFERENT competency or topic area than any question already asked
- Probe areas where the answer was vague, shallow, or could be expanded (if an answer was given)
- Feel natural as the next question a real interviewer would ask
- Are NOT repetitions of anything above
"""
    else:
        seeds = _TOPIC_SEEDS.get(interview_type, [])
        topic_hint = f" Focus this opening question specifically on: **{random.choice(seeds)}**." if seeds else ""
        history_section = f"Generate {num} {interview_type} interview question(s) to start the session.{topic_hint}"

    return f"""\
{history_section}

Role: {role}
Experience level: {level}
{company_line}
Difficulty: {difficulty}{resume_line}{history_block}{past_questions_block}
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
