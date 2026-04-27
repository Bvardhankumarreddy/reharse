"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type QType = "mcq" | "true_false" | "multi_select" | "numeric";
type Letter = "A" | "B" | "C" | "D";

interface PublicQuestion {
  id: string;
  questionType: QType;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  numericUnit: string | null;
}

interface SessionState {
  sessionId: string;
  quizWeek: number;
  questionNumber: number;
  totalQuestions: number;
  question: PublicQuestion;
  expiresAt: string;
  durationMinutes: number;
}

function formatMMSS(seconds: number) {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function QuizPlayPage() {
  const router = useRouter();
  const [state, setState] = useState<SessionState | null>(null);
  const [selectedSingle, setSelectedSingle] = useState<Letter | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<Letter[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tiebreaker, setTiebreaker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const expiredHandledRef = useRef(false);

  // Restore session
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

  function resetSelection() {
    setSelectedSingle(null);
    setSelectedMulti([]);
    setSelectedNumber("");
  }

  const handleComplete = useCallback(async (autoTiebreaker?: string) => {
    if (!state) return;
    setSubmitting(true);
    setError(null);
    try {
      const tbStr = autoTiebreaker !== undefined ? autoTiebreaker : tiebreaker;
      const tb = tbStr.trim() ? parseInt(tbStr.trim(), 10) : undefined;
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
  }, [state, tiebreaker, router]);

  const submitAnswer = useCallback(async (
    body: { selectedAnswer?: string; selectedAnswers?: string[]; selectedNumber?: number },
  ) => {
    if (!state || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, ...body }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Submit failed");
      const data = await res.json();

      if (data.done) {
        if (data.expired) {
          await handleComplete("");
          return;
        }
        setShowTiebreaker(true);
      } else {
        const next: SessionState = {
          ...state,
          questionNumber: data.questionNumber,
          totalQuestions: data.totalQuestions,
          question: data.question,
          expiresAt: data.expiresAt ?? state.expiresAt,
        };
        sessionStorage.setItem("quiz-session", JSON.stringify(next));
        setState(next);
        resetSelection();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [state, handleComplete]);

  // Build the answer payload based on current question type
  function buildAnswerPayload(): { selectedAnswer?: string; selectedAnswers?: string[]; selectedNumber?: number } | null {
    if (!state) return null;
    const t = state.question.questionType;
    if (t === "mcq" || t === "true_false") {
      if (!selectedSingle) return null;
      return { selectedAnswer: selectedSingle };
    }
    if (t === "multi_select") {
      if (selectedMulti.length === 0) return null;
      return { selectedAnswers: selectedMulti };
    }
    if (t === "numeric") {
      const n = parseFloat(selectedNumber);
      if (isNaN(n)) return null;
      return { selectedNumber: n };
    }
    return null;
  }

  // Auto-submit on timer expiry — uses whatever is selected, or A as fallback
  const submitForExpiry = useCallback(() => {
    if (!state) return;
    const t = state.question.questionType;
    if (t === "mcq" || t === "true_false") {
      void submitAnswer({ selectedAnswer: selectedSingle ?? "A" });
    } else if (t === "multi_select") {
      void submitAnswer({ selectedAnswers: selectedMulti.length ? selectedMulti : ["A"] });
    } else if (t === "numeric") {
      const n = parseFloat(selectedNumber);
      void submitAnswer({ selectedNumber: isNaN(n) ? 0 : n });
    }
  }, [state, selectedSingle, selectedMulti, selectedNumber, submitAnswer]);

  // Global session countdown
  useEffect(() => {
    if (!state?.expiresAt) return;
    const tick = () => {
      const ms = new Date(state.expiresAt).getTime() - Date.now();
      const secs = Math.floor(ms / 1000);
      setSecondsLeft(secs);
      if (secs <= 0 && !expiredHandledRef.current) {
        expiredHandledRef.current = true;
        if (showTiebreaker) {
          void handleComplete("");
        } else {
          submitForExpiry();
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.expiresAt, showTiebreaker, submitForExpiry, handleComplete]);

  if (!state) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-12 text-center">
        <div className="w-8 h-8 mx-auto rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" />
      </div>
    );
  }

  const progress = ((state.questionNumber - 1) / state.totalQuestions) * 100;
  const lowTime = secondsLeft <= 30;
  const veryLow = secondsLeft <= 10;
  const qType = state.question.questionType;

  // Tiebreaker view
  if (showTiebreaker) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-12 sm:py-20">
        <div className="text-center mb-8">
          <span className="inline-block text-[11px] font-bold tracking-widest text-[#FFD700] uppercase mb-3">
            🏆 Final Question
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Tiebreaker (Optional)</h1>
          <p className="text-[#B8C5E0]">If multiple players tie, the closest answer wins.</p>
          {secondsLeft > 0 && (
            <p className={`text-sm mt-2 ${lowTime ? "text-[#FFD700]" : "text-[#B8C5E0]"}`}>
              ⏱ {formatMMSS(secondsLeft)} left
            </p>
          )}
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
              onClick={() => handleComplete()}
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-[#0A0E27] font-bold py-3 rounded-xl hover:shadow-[0_0_30px_rgba(255,215,0,0.4)] transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Final"}
            </button>
            <button
              onClick={() => { setTiebreaker(""); handleComplete(""); }}
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

  function toggleMulti(letter: Letter) {
    setSelectedMulti((prev) =>
      prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter].sort() as Letter[],
    );
  }

  // Determine which options to render for this question
  const optionLetters: Letter[] = qType === "true_false" ? ["A", "B"] : ["A", "B", "C", "D"];
  const optionTexts: Record<Letter, string> = {
    A: state.question.optionA,
    B: state.question.optionB,
    C: state.question.optionC,
    D: state.question.optionD,
  };

  const canSubmit = !submitting && buildAnswerPayload() !== null;

  // Helper text for type
  const typeBadge: Record<QType, { label: string; tip: string }> = {
    mcq: { label: "Multiple Choice", tip: "Pick one answer" },
    true_false: { label: "True / False", tip: "Pick one" },
    multi_select: { label: "Multi-Select", tip: "Pick all that apply" },
    numeric: { label: "Numeric Answer", tip: "Type your answer" },
  };

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 sm:py-12">
      {/* Progress bar + global timer */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[11px] font-bold tracking-widest text-[#00D4FF] uppercase">
            Question {state.questionNumber} of {state.totalQuestions}
          </span>
          <div
            className={`text-base font-bold tabular-nums px-3 py-1 rounded-lg ${
              veryLow ? "text-[#FF5C7C] bg-[#FF5C7C]/10 animate-pulse" :
              lowTime ? "text-[#FFD700] bg-[#FFD700]/10" :
              "text-[#00F5A0] bg-[#00F5A0]/10"
            }`}
          >
            ⏱ {formatMMSS(secondsLeft)}
          </div>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00D4FF] to-[#00F5A0] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest bg-[#00D4FF]/15 text-[#00D4FF] px-2 py-0.5 rounded">
          {typeBadge[qType].label}
        </span>
        <span className="text-[10px] text-[#4A5470]">{typeBadge[qType].tip}</span>
      </div>

      {/* Question */}
      <h1 className="text-[22px] sm:text-[26px] font-bold text-white leading-snug mb-8">
        {state.question.questionText}
      </h1>

      {/* Type-specific input */}
      {(qType === "mcq" || qType === "true_false") && (
        <div className="space-y-3 mb-6">
          {optionLetters.map((key) => {
            const isSelected = selectedSingle === key;
            return (
              <button
                key={key}
                onClick={() => !submitting && setSelectedSingle(key)}
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
                  <span className="text-white text-base sm:text-lg pt-1">{optionTexts[key]}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {qType === "multi_select" && (
        <div className="space-y-3 mb-6">
          {optionLetters.map((key) => {
            const isSelected = selectedMulti.includes(key);
            return (
              <button
                key={key}
                onClick={() => !submitting && toggleMulti(key)}
                disabled={submitting}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? "bg-[#00F5A0]/10 border-[#00F5A0] shadow-[0_0_20px_rgba(0,245,160,0.2)]"
                    : "bg-[#151B3D] border-white/5 hover:border-white/20"
                } disabled:opacity-50`}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold shrink-0 transition-colors ${
                      isSelected ? "bg-[#00F5A0] text-[#0A0E27]" : "bg-white/5 text-[#B8C5E0]"
                    }`}
                  >
                    {isSelected ? "✓" : key}
                  </span>
                  <span className="text-white text-base sm:text-lg pt-1">{optionTexts[key]}</span>
                </div>
              </button>
            );
          })}
          <p className="text-[#4A5470] text-xs text-center">
            {selectedMulti.length === 0 ? "Tap all options that apply" : `${selectedMulti.length} selected`}
          </p>
        </div>
      )}

      {qType === "numeric" && (
        <div className="bg-[#151B3D] border-2 border-white/5 rounded-2xl p-6 mb-6">
          <label className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-2">
            Your Answer
          </label>
          <div className="flex items-baseline gap-3">
            <input
              type="number"
              step="any"
              value={selectedNumber}
              onChange={(e) => setSelectedNumber(e.target.value)}
              placeholder="Enter a number"
              className="flex-1 bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white text-2xl font-bold placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
            />
            {state.question.numericUnit && (
              <span className="text-[#B8C5E0] text-base sm:text-lg font-medium">{state.question.numericUnit}</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-3 text-[#FF5C7C] text-sm mb-4">
          {error}
        </div>
      )}

      <button
        onClick={() => {
          const payload = buildAnswerPayload();
          if (payload) void submitAnswer(payload);
        }}
        disabled={!canSubmit}
        className="w-full bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold text-lg py-4 rounded-xl shadow-[0_0_30px_rgba(0,212,255,0.3)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        {submitting ? "Submitting..." : "Submit Answer →"}
      </button>
    </div>
  );
}
