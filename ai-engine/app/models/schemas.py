from __future__ import annotations

from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class InterviewType(str, Enum):
    behavioral  = "behavioral"
    coding      = "coding"
    system_design = "system-design"
    hr          = "hr"
    case_study  = "case-study"


class Difficulty(str, Enum):
    easy   = "easy"
    medium = "medium"
    hard   = "hard"


class AnswerMode(str, Enum):
    text  = "text"
    voice = "voice"
    mixed = "mixed"


# ── Question Generation ───────────────────────────────────────────────────────

class PreviousQA(BaseModel):
    question: str
    answer:   str


class GenerateQuestionsRequest(BaseModel):
    interview_type:   InterviewType
    target_role:      str = "Software Engineer"
    target_company:   str | None = None
    experience_level: str = "Mid-level (3–5 years)"
    num_questions:    int = Field(default=1, ge=1, le=20)
    resume_context:   str | None = Field(default=None, description="Extracted resume text")
    difficulty:       Difficulty = Difficulty.medium
    previous_qa:      list[PreviousQA] | None = Field(
        default=None,
        description="Prior question-answer pairs from this session for adaptive generation",
    )
    user_history:     dict | None = Field(
        default=None,
        description="Aggregated candidate history: recentScores, weakAreas, recurringFeedback, previouslyAskedQuestions",
    )


class GeneratedQuestion(BaseModel):
    id:           str
    question:     str
    type:         InterviewType
    difficulty:   Difficulty
    tags:         list[str] = []
    follow_ups:   list[str] = []
    hints:        list[str] = []
    time_estimate_seconds: int = 120


class GenerateQuestionsResponse(BaseModel):
    questions:   list[GeneratedQuestion]
    session_tip: str | None = None


# ── Answer Evaluation ─────────────────────────────────────────────────────────

class TranscriptItem(BaseModel):
    question_id: str
    question:    str
    answer:      str
    time_spent_seconds: int | None = None


class SessionContext(BaseModel):
    interview_type:   InterviewType
    target_role:      str = "Software Engineer"
    target_company:   str | None = None
    experience_level: str = "Mid-level (3–5 years)"


class EvaluateRequest(BaseModel):
    session_id:   str
    transcript:   list[TranscriptItem]
    context:      SessionContext
    user_history: dict | None = Field(
        default=None,
        description="Aggregated candidate history: recentScores, weakAreas, recurringFeedback",
    )


class DimensionScore(BaseModel):
    score:    int = Field(ge=0, le=100)
    rationale: str


class QuestionFeedback(BaseModel):
    question_id:  str
    question:     str
    answer:       str
    score:        int = Field(ge=0, le=100)
    strengths:    list[str]
    improvements: list[str]
    model_answer: str | None = None


class NextStep(BaseModel):
    type:        str  # practice | read | watch
    title:       str
    description: str
    link:        str | None = None


class EvaluateResponse(BaseModel):
    session_id:       str
    overall_score:    int = Field(ge=0, le=100)
    dimension_scores: dict[str, int]
    summary:          str
    question_feedback: list[QuestionFeedback]
    next_steps:       list[NextStep]
    weak_areas:       list[str]
    model_used:       str


# ── AI Coach ──────────────────────────────────────────────────────────────────

class CoachMessage(BaseModel):
    role:    str  # "user" | "assistant"
    content: str


class CoachRequest(BaseModel):
    messages:         list[CoachMessage]
    user_context: dict[str, Any] = Field(
        default_factory=dict,
        description="{ targetRole, weakAreas, recentSessions, currentStreak }",
    )
    stream: bool = False


class CoachResponse(BaseModel):
    reply:       str
    suggestions: list[str] = []


# ── Resume Parser ─────────────────────────────────────────────────────────────

class ResumeParseResponse(BaseModel):
    raw_text:         str
    target_role:      str | None
    experience_level: str | None
    skills:           list[str]
    companies:        list[str]
    summary:          str


# ── JD Match ──────────────────────────────────────────────────────────────────

class JDMatchRequest(BaseModel):
    job_description: str
    resume_text:     str | None = None
    target_role:     str | None = None


class JDMatchResponse(BaseModel):
    match_score:        int  # 0-100
    matched_keywords:   list[str]
    missing_keywords:   list[str]
    strengths:          list[str]
    gaps:               list[str]
    recommendations:    list[str]
    summary:            str
