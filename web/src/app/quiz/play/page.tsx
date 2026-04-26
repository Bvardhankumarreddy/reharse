"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface PublicQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
}

interface SessionState {
  sessionId: string;
  quizWeek: number;
  questionNumber: number;
  totalQuestions: number;
  question: PublicQuestion;
}

const TIMER_SECONDS = 30;

export default function QuizPlayPage() {
  const router = useRouter();
  const [state, setState] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tiebreaker, setTiebreaker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const raw = sessionStorage.getItem("quiz-session");
    if (!raw) {
      router.replace("/quiz/start");
      return;
    }
    try {
      setState(JSON.parse(raw));
    } catch {
      router.replace("/quiz/start");
    }
  }, [router]);

  const submitAnswer = useCallback(async (answer: "A" | "B" | "C" | "D") => {
    if (!state || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, selectedAnswer: answer }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Submit failed");
      const data = await res.json();

      if (data.done) {
        setShowTiebreaker(true);
        sessionStorage.setItem("quiz-session", JSON.stringify({ ...state, done: true }));
      } else {
        const next = { ...state, questionNumber: data.questionNumber, totalQuestions: data.totalQuestions, question: data.question };
        sessionStorage.setItem("quiz-session", JSON.stringify(next));
        setState(next);
        setSelected(null);
        setTimeLeft(TIMER_SECONDS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [state]);

  // Timer countdown
  useEffect(() => {
    if (!state || showTiebreaker || submitting) return;
    if (timeLeft <= 0) {
      // Auto-submit a default answer if time runs out (selecting whatever they picked, or A as fallback)
      submitAnswer(selected ?? "A");
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, state, showTiebreaker, submitting, selected, submitAnswer]);

  async function handleComplete() {
    if (!state) return;
    setSubmitting(true);
    setError(null);
    try {
      const tb = tiebreaker.trim() ? parseInt(tiebreaker.trim(), 10) : undefined;
      const res = await fetch("/api/v1/quiz/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, tiebreakerAnswer: tb }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Complete failed");
      const result = await res.json();
      sessionStorage.setItem("quiz-result", JSON.stringify(result));
      sessionStorage.removeItem("quiz-session");
      router.push("/quiz/results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (!state) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-12 text-center">
        <div className="w-8 h-8 mx-auto rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" />
      </div>
    );
  }

  const progress = ((state.questionNumber - 1) / state.totalQuestions) * 100;
  const opts: Array<{ key: "A" | "B" | "C" | "D"; text: string }> = [
    { key: "A", text: state.question.optionA },
    { key: "B", text: state.question.optionB },
    { key: "C", text: state.question.optionC },
    { key: "D", text: state.question.optionD },
  ];

  // Tiebreaker view
  if (showTiebreaker) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-12 sm:py-20">
        <div className="text-center mb-8">
          <span className="inline-block text-[11px] font-bold tracking-widest text-[#FFD700] uppercase mb-3">
            🏆 Final Question
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Tiebreaker (Optional)</h1>
          <p className="text-[#B8C5E0]">
            If multiple players tie, the closest answer to the truth wins.
          </p>
        </div>

        <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-6 sm:p-8 space-y-5">
          <p className="text-white text-lg sm:text-xl font-medium">
            How many parameters (in billions) does GPT-4 have?
          </p>
          <input
            type="number"
            value={tiebreaker}
            onChange={(e) => setTiebreaker(e.target.value)}
            placeholder="Your guess (a number)"
            className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#4A5470] focus:outline-none focus:border-[#FFD700] text-lg"
          />

          {error && (
            <div className="bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-3 text-[#FF5C7C] text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleComplete}
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-[#0A0E27] font-bold py-3 rounded-xl hover:shadow-[0_0_30px_rgba(255,215,0,0.4)] transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Final"}
            </button>
            <button
              onClick={() => { setTiebreaker(""); handleComplete(); }}
              disabled={submitting}
              className="px-6 text-[#B8C5E0] hover:text-white text-sm transition"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Question view
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 sm:py-12">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[11px] font-bold tracking-widest text-[#00D4FF] uppercase">
            Question {state.questionNumber} of {state.totalQuestions}
          </span>
          <div
            className={`text-sm font-bold tabular-nums ${
              timeLeft <= 5 ? "text-[#FF5C7C]" : timeLeft <= 10 ? "text-[#FFD700]" : "text-[#00F5A0]"
            }`}
          >
            ⏱ {timeLeft}s
          </div>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00D4FF] to-[#00F5A0] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <h1 className="text-[22px] sm:text-[26px] font-bold text-white leading-snug mb-8">
        {state.question.questionText}
      </h1>

      {/* Options */}
      <div className="space-y-3 mb-6">
        {opts.map(({ key, text }) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => !submitting && setSelected(key)}
              disabled={submitting}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                isSelected
                  ? "bg-[#00D4FF]/10 border-[#00D4FF] shadow-[0_0_20px_rgba(0,212,255,0.2)]"
                  : "bg-[#151B3D] border-white/5 hover:border-white/20"
              } disabled:opacity-50`}
            >
              <div className="flex items-start gap-4">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 transition-colors ${
                    isSelected ? "bg-[#00D4FF] text-[#0A0E27]" : "bg-white/5 text-[#B8C5E0]"
                  }`}
                >
                  {key}
                </span>
                <span className="text-white text-base sm:text-lg pt-1">{text}</span>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-3 text-[#FF5C7C] text-sm mb-4">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={() => selected && submitAnswer(selected)}
        disabled={!selected || submitting}
        className="w-full bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold text-lg py-4 rounded-xl shadow-[0_0_30px_rgba(0,212,255,0.3)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        {submitting ? "Submitting..." : "Submit Answer →"}
      </button>
    </div>
  );
}
