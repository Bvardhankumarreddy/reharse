from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import questions, evaluate, coach, resume, voice, jd_match, jd_interview_prep

app = FastAPI(
    title="Rehearse AI Engine",
    description="Question generation, answer evaluation, and AI coaching via Claude",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(questions.router, prefix="/questions", tags=["Question Generation"])
app.include_router(evaluate.router,  prefix="/evaluate",  tags=["Evaluation"])
app.include_router(coach.router,     prefix="/coach",     tags=["AI Coach"])
app.include_router(resume.router,    prefix="/resume",    tags=["Resume Parser"])
app.include_router(voice.router,     prefix="/voice",     tags=["Voice Transcription"])
app.include_router(jd_match.router,  prefix="/jd-match",  tags=["JD Match"])
app.include_router(jd_interview_prep.router, prefix="/jd-interview-prep", tags=["JD Interview Prep"])


@app.get("/health", tags=["Health"])
async def health() -> dict:
    return {"status": "ok"}
