"use client";

// Spec § Screen 3: Live Interview
// WebSocket-driven: connects to NestJS Socket.io gateway, receives questions,
// submits answers, listens for feedback_ready → redirects to /sessions/:id

import { useState, Suspense, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApiClient } from "@/lib/hooks/useApiClient";
import { authClient } from "@/lib/auth-client";
import { clsx } from "clsx";
import { useInterviewSocket, fmtMs } from "@/lib/hooks/useInterviewSocket";
import { useVoiceRecorder } from "@/lib/hooks/useVoiceRecorder";
import { useCameraRecorder } from "@/lib/hooks/useCameraRecorder";
import { useInterviewerTTS } from "@/lib/hooks/useInterviewerTTS";
import CameraPreview from "@/components/CameraPreview";

// ── STAR detection ─────────────────────────────────────────────────────────────

const STAR_LABELS = ["S", "T", "A", "R"];
const STAR_KEYWORDS: Record<string, string[]> = {
  S: ["situation", "context", "was working", "at the time", "background"],
  T: ["task", "responsible", "needed to", "goal", "objective", "my role"],
  A: ["action", "decided", "implemented", "worked with", "approached", "did"],
  R: ["result", "outcome", "impact", "achieved", "increased", "reduced", "learned"],
};

function detectStar(text: string): Record<string, boolean> {
  const lower = text.toLowerCase();
  return Object.fromEntries(
    Object.entries(STAR_KEYWORDS).map(([key, words]) => [key, words.some((w) => lower.includes(w))])
  );
}

// ── Feedback waiter — polls API with progressive messaging ───────────────────

function FeedbackWaiter({ sessionId, router }: { sessionId: string; router: ReturnType<typeof useRouter> }) {
  const { api, ready } = useApiClient();
  const [phase, setPhase] = useState<"waiting" | "slow" | "timeout">("waiting");

  useEffect(() => {
    if (!ready) return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts === 10) setPhase("slow");
      try {
        await api.getFeedbackBySession(sessionId);
        clearInterval(interval);
        router.push(`/sessions/${sessionId}`);
      } catch {
        if (attempts >= 20) {
          clearInterval(interval);
          setPhase("timeout");
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [api, ready, sessionId, router]);

  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#22C55E] to-[#3B82F6] flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[32px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check</span>
        </div>
        <p className="text-[18px] font-bold text-text-pri">Interview complete!</p>

        {phase === "waiting" && (
          <>
            <p className="text-text-sec text-sm">Generating your feedback report…</p>
            <div className="w-6 h-6 mx-auto border-2 border-blue border-t-transparent rounded-full animate-spin" />
          </>
        )}

        {phase === "slow" && (
          <>
            <p className="text-text-sec text-sm">This is taking a little longer than usual — almost there.</p>
            <div className="w-6 h-6 mx-auto border-2 border-blue border-t-transparent rounded-full animate-spin" />
          </>
        )}

        {phase === "timeout" && (
          <>
            <p className="text-text-sec text-sm">
              The report is still being generated. You can check back in a moment.
            </p>
            <button
              onClick={() => router.push(`/sessions/${sessionId}`)}
              className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-sm shadow-blue-glow"
            >
              View Session →
            </button>
            <p className="text-[12px] text-text-muted">The report will appear once ready.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Interview type label ───────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  behavioral:      "Behavioral Interview",
  coding:          "Coding Interview",
  "system-design": "System Design",
  hr:              "HR Interview",
  "case-study":    "Case Study",
};

const PHASE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  behavioral:      { label: "Behavioral Round",    icon: "forum",        color: "#7C3AED" },
  coding:          { label: "Coding Challenge",     icon: "code",         color: "#0EA5E9" },
  "system-design": { label: "System Design Round", icon: "architecture", color: "#F59E0B" },
};

// ── AI Interviewer personas by type ───────────────────────────────────────────

const INTERVIEWER: Record<string, { name: string; title: string; initials: string; gradient: string }> = {
  behavioral:      { name: "Alex Morgan",  title: "Senior Engineering Manager",  initials: "AM", gradient: "from-[#7C3AED] to-[#3B82F6]" },
  coding:          { name: "Priya Sharma", title: "Staff Software Engineer",      initials: "PS", gradient: "from-[#0EA5E9] to-[#06B6D4]" },
  "system-design": { name: "James Liu",    title: "Principal Systems Architect",  initials: "JL", gradient: "from-[#F59E0B] to-[#EF4444]" },
  hr:              { name: "Sarah Chen",   title: "Head of People & Culture",     initials: "SC", gradient: "from-[#22C55E] to-[#0EA5E9]" },
  "case-study":    { name: "David Park",   title: "Director of Product Strategy", initials: "DP", gradient: "from-[#EC4899] to-[#F59E0B]" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

function InterviewSessionPageInner() {
  const params     = useSearchParams();
  const router     = useRouter();
  const { data: session } = authClient.useSession();

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!session) return null;
    try {
      const res = await fetch("/api/auth/token");
      if (!res.ok) return null;
      const data = await res.json() as { token?: string };
      return data.token ?? null;
    } catch {
      return null;
    }
  }, [session]);

  const sessionId = params.get("sessionId");
  const type      = params.get("type") ?? "behavioral";
  const role      = params.get("role") ?? "Software Engineer";
  const mode      = params.get("mode") ?? "text";

  const [answer,       setAnswer]       = useState("");
  const [hintOpen,     setHintOpen]     = useState(false);
  const [coachOpen,    setCoachOpen]    = useState(false);
  const [coachInput,   setCoachInput]   = useState("");
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [showPhase,    setShowPhase]    = useState(false);

  const coachBottomRef = useRef<HTMLDivElement>(null);

  const handleFeedbackReady = useCallback((_feedbackId: string) => {
    router.push(`/sessions/${sessionId}`);
  }, [router, sessionId]);

  const {
    connected, question, questionIndex, totalQuestions,
    elapsed, remaining, ended, aiTyping, wsError, sessionError,
    currentHint, clearHint,
    coachMessages, coachTyping, sendCoachMessage,
    phaseTransition, clearPhaseTransition,
    submitAnswer, passQuestion, requestHint, endSession, clearSessionError,
  } = useInterviewSocket(sessionId, getToken, handleFeedbackReady);

  const [interimText, setInterimText] = useState("");

  const { recording, micError, toggle: toggleMic } = useVoiceRecorder(
    (interim) => setInterimText(interim),
    (final)   => { setAnswer((prev) => prev ? `${prev} ${final}` : final); setInterimText(""); },
  );

  const { active: camActive, stream: camStream, recording: camRecording,
          downloadUrl: camDownload, camError, toggleCamera, stopCamera,
        } = useCameraRecorder();

  function handleSubmit() {
    if (!answer.trim()) return;
    submitAnswer(answer);
    setAnswer("");
    setHintOpen(false);
    clearHint();
  }

  // ── Loading timeout ────────────────────────────────────────────────────────
  useEffect(() => {
    if (question) return;
    const t = setTimeout(() => setLoadTimedOut(true), 25_000);
    return () => clearTimeout(t);
  }, [question]);

  // ── Phase transition banner ────────────────────────────────────────────────
  useEffect(() => {
    if (!phaseTransition) return;
    setShowPhase(true);
    const t = setTimeout(() => { setShowPhase(false); clearPhaseTransition(); }, 5_000);
    return () => clearTimeout(t);
  }, [phaseTransition, clearPhaseTransition]);

  // ── Scroll coach to bottom on new messages ─────────────────────────────────
  useEffect(() => {
    coachBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [coachMessages, coachTyping]);

  // ── Anti-cheat: block tab switching, external paste, right-click ──────────
  const [tabWarning, setTabWarning] = useState(0); // count of times user left tab

  useEffect(() => {
    if (!question || ended) return; // only enforce during active session

    // 1. Detect tab/window switching — auto-end session after 2 switches
    function handleVisibilityChange() {
      if (document.hidden) {
        setTabWarning((n) => {
          const next = n + 1;
          if (next >= 2) {
            // End the session immediately on the 2nd switch
            endSession();
          }
          return next;
        });
      }
    }

    // 2. Block paste from outside — allow only if clipboard content
    //    originated from within the answer textarea itself
    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      // Allow paste inside the answer textarea
      if (target.tagName === "TEXTAREA" && target.id === "answer-input") return;
      e.preventDefault();
    }

    // 3. Block paste keyboard shortcut on the answer textarea
    //    when the clipboard content was copied from outside the page
    function handleAnswerPaste(e: ClipboardEvent) {
      // If the page was focused when the copy happened, allow it
      // (user copied from within the session page — e.g. part of the question)
      // If page was hidden when copied, block it
      if (tabWarning > 0 && document.hasFocus()) {
        // Extra guard — block if the pasted text is long (likely copied from outside)
        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (text.length > 200) {
          e.preventDefault();
          return;
        }
      }
    }

    // 4. Disable right-click context menu
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    const answerEl = document.getElementById("answer-input");
    if (answerEl) answerEl.addEventListener("paste", handleAnswerPaste);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      if (answerEl) answerEl.removeEventListener("paste", handleAnswerPaste);
    };
  }, [question, ended, tabWarning, endSession]);

  const isBehavioral = type === "behavioral";
  const star = detectStar(answer);
  const timerColor = remaining > 0 && remaining < 60_000 ? "text-red-500" : "text-[#F59E0B]";
  const voiceEnabled = mode === "voice" || mode === "mixed";

  // ── AI Interviewer persona + TTS ──────────────────────────────────────────
  // For full-loop, use the current phase's persona
  const activeType = phaseTransition?.phase ?? type;
  const persona = INTERVIEWER[activeType] ?? INTERVIEWER["behavioral"];
  const { speak, speaking, muted, toggleMute } = useInterviewerTTS(true);

  useEffect(() => {
    if (question?.question && !aiTyping) {
      speak(question.question);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.question, aiTyping]);

  // ── Guard: no sessionId ───────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-[16px] font-semibold text-text-pri">No session found</p>
          <p className="text-text-sec text-sm">Please start from the setup wizard.</p>
          <button onClick={() => router.push("/interview/setup")}
            className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-sm">
            Back to setup
          </button>
        </div>
      </div>
    );
  }

  // ── Guard: connection error ───────────────────────────────────────────────
  if (wsError) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-[48px] text-red-400">error</span>
          <p className="text-[16px] font-semibold text-text-pri">Connection failed</p>
          <p className="text-text-sec text-sm">{wsError}</p>
          <button onClick={() => router.push("/interview/setup")}
            className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-sm">
            Start over
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!connected || !question) {
    if (loadTimedOut) {
      return (
        <div className="min-h-screen bg-bg-app flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <span className="material-symbols-outlined text-[48px] text-amber-400">hourglass_disabled</span>
            <p className="text-[16px] font-semibold text-text-pri">Taking too long to load</p>
            <p className="text-text-sec text-sm">The AI engine may be starting up. Please try again in a moment.</p>
            <div className="flex gap-3 justify-center pt-1">
              <button onClick={() => window.location.reload()}
                className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-sm shadow-blue-glow">
                Retry
              </button>
              <button onClick={() => router.push("/interview/setup")}
                className="px-4 py-2.5 border border-border rounded-btn text-sm font-semibold text-text-sec hover:bg-surface transition-colors">
                New setup
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] animate-pulse" />
          <p className="text-[16px] font-semibold text-text-pri">
            {connected ? "Preparing your interview…" : "Connecting…"}
          </p>
          <p className="text-text-sec text-sm">AI is personalizing questions for your role</p>
        </div>
      </div>
    );
  }

  // ── Session ended ──────────────────────────────────────────────────────────
  if (ended) {
    return <FeedbackWaiter sessionId={sessionId} router={router} />;
  }

  // ── Live interview ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-app flex flex-col">

      {/* Tab-switch warning banner */}
      {tabWarning > 0 && (
        <div className={`fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-3
                        px-4 py-2.5 text-sm font-semibold shadow-lg text-white
                        ${tabWarning >= 2 ? "bg-red-700" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>warning</span>
          {tabWarning === 1
            ? "⚠️ Warning: Do not switch tabs during the interview. One more violation will end your session."
            : "🚫 Interview terminated — tab switching detected twice. Your session has been ended."}
        </div>
      )}

      {/* Phase transition banner */}
      {showPhase && phaseTransition && (() => {
        const ph = PHASE_LABELS[phaseTransition.phase];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-3 bg-surface border-2 shadow-2xl rounded-2xl px-8 py-6 animate-bounce-in"
              style={{ borderColor: ph?.color ?? "#3B82F6" }}>
              <span className="material-symbols-outlined text-[36px]"
                style={{ color: ph?.color, fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>
                {ph?.icon ?? "navigate_next"}
              </span>
              <p className="text-[18px] font-black text-text-pri">{ph?.label ?? phaseTransition.phase}</p>
              <p className="text-[13px] text-text-muted">Next section starting…</p>
            </div>
          </div>
        );
      })()}

      {/* Top bar */}
      <header className="bg-surface border-b border-border px-4 lg:px-8 py-3 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="px-2 sm:px-3 py-1 bg-violet-50 text-[#7C3AED] rounded-chip label flex-shrink-0" style={{ fontSize: 10 }}>
            {TYPE_LABELS[type] ?? "Interview"}
          </span>
          <span className="text-small text-text-sec hidden sm:block truncate">{role}</span>
        </div>

        <span className={clsx("font-mono text-[15px] sm:text-[20px] font-bold flex-shrink-0", timerColor)}>
          {elapsed > 0 ? fmtMs(elapsed) : "00:00"}
        </span>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-small text-text-sec hidden sm:block">
            Q {questionIndex + 1} / up to {totalQuestions}
          </span>
          {/* Coach toggle */}
          <button
            onClick={() => setCoachOpen((o) => !o)}
            className={clsx(
              "flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-btn text-[12px] sm:text-[13px] font-semibold border transition-colors",
              coachOpen
                ? "bg-violet-50 border-violet-200 text-[#7C3AED]"
                : "border-border text-text-muted hover:border-blue/40 hover:text-blue"
            )}
          >
            <span className="material-symbols-outlined text-[16px]"
              style={{ fontVariationSettings: coachOpen ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}>
              support_agent
            </span>
            <span className="hidden sm:inline">Coach</span>
            {coachMessages.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#7C3AED] text-white text-[9px] font-bold flex items-center justify-center">
                {coachMessages.filter((m) => m.role === "coach").length}
              </span>
            )}
          </button>
          <button
            onClick={endSession}
            className="px-2 sm:px-3 py-1.5 border border-red/40 text-red rounded-btn text-[12px] sm:text-[13px] font-semibold hover:bg-red-50 transition-colors whitespace-nowrap"
          >
            <span className="hidden sm:inline">End Interview</span>
            <span className="sm:hidden">End</span>
          </button>
        </div>
      </header>

      {/* Two-column layout */}
      <main className="flex-1 flex flex-col lg:flex-row gap-0 max-w-app mx-auto w-full">

        {/* Left panel — AI question */}
        <div className={clsx("flex-1 p-4 lg:p-8", coachOpen ? "lg:w-[45%]" : "lg:w-[60%]")}>
          <div className="bg-surface border border-border rounded-card p-6 shadow-card h-full flex flex-col gap-6">

            {/* AI Interviewer persona */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className={clsx(
                    "w-14 h-14 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-[16px] shadow-blue-glow transition-all",
                    persona.gradient,
                    (speaking || aiTyping) && "ring-4 ring-offset-2 ring-offset-surface ring-blue/40",
                  )}>
                    {persona.initials}
                  </div>
                  {speaking && (
                    <span className="absolute inset-0 rounded-full bg-blue/20 animate-ping" />
                  )}
                  <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-[#22C55E] border-2 border-surface" />
                </div>

                <div>
                  <p className="text-[14px] font-bold text-text-pri">{persona.name}</p>
                  <p className="text-[11px] text-text-muted">{persona.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {aiTyping ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: "300ms" }} />
                        <span className="text-small text-[#7C3AED] font-medium">Thinking…</span>
                      </>
                    ) : speaking ? (
                      <>
                        <span className="flex gap-0.5 items-end h-3">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className="w-0.5 bg-blue rounded-full animate-bounce"
                              style={{ height: `${8 + (i % 2) * 4}px`, animationDelay: `${i * 80}ms` }} />
                          ))}
                        </span>
                        <span className="text-small text-blue font-medium">Speaking…</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
                        <span className="text-small text-text-sec">Listening</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={toggleMute}
                title={muted ? "Unmute interviewer" : "Mute interviewer voice"}
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex-shrink-0",
                  muted
                    ? "bg-red-50 border-red-200 text-red-500"
                    : "bg-bg-app border-border text-text-muted hover:border-blue/40 hover:text-blue"
                )}
              >
                <span className="material-symbols-outlined text-[15px]"
                  style={{ fontVariationSettings: muted ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}>
                  {muted ? "volume_off" : "volume_up"}
                </span>
                <span className="hidden sm:inline">{muted ? "Voice off" : "Voice on"}</span>
              </button>
            </div>

            {/* Question */}
            <div className="space-y-4">
              <span className="label text-[#7C3AED]" style={{ fontSize: 10 }}>
                {(question.category ?? type).toUpperCase()}
              </span>
              <p className="text-[16px] sm:text-[20px] font-semibold text-text-pri leading-relaxed">
                {question.question}
              </p>
              <p className="text-small text-text-muted flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">info</span>
                AI will ask a follow-up based on your answer
              </p>

              {/* Hint section */}
              <div>
                <button
                  onClick={() => {
                    const next = !hintOpen;
                    setHintOpen(next);
                    if (next && !currentHint) requestHint();
                  }}
                  className="flex items-center gap-2 text-small text-text-sec font-semibold hover:text-text-pri transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {hintOpen ? "expand_less" : "expand_more"}
                  </span>
                  Hint
                </button>
                {hintOpen && (
                  <div className="mt-3 p-4 bg-bg-app rounded-xl space-y-2">
                    {isBehavioral ? (
                      <>
                        <p className="text-small font-semibold text-text-pri">Use STAR structure:</p>
                        {[
                          ["S", "Situation", "Set the context — where, when, who was involved?"],
                          ["T", "Task",      "What was your specific responsibility or goal?"],
                          ["A", "Action",    "What steps did YOU take? Be specific."],
                          ["R", "Result",    "What was the measurable outcome? Quantify if possible."],
                        ].map(([key, label, desc]) => (
                          <div key={key} className="flex gap-2 text-small text-text-sec">
                            <span className="font-mono font-bold text-[#7C3AED] flex-shrink-0">{key}:</span>
                            <span><strong>{label}</strong> — {desc}</span>
                          </div>
                        ))}
                      </>
                    ) : currentHint ? (
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-blue flex-shrink-0 mt-0.5"
                          style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>lightbulb</span>
                        <p className="text-small text-text-pri leading-relaxed">{currentHint}</p>
                      </div>
                    ) : question.hints?.length > 0 ? (
                      question.hints.map((hint, i) => (
                        <p key={i} className="text-small text-text-sec">• {hint}</p>
                      ))
                    ) : (
                      <p className="text-small text-text-sec">Take your time and structure your thoughts before answering.</p>
                    )}
                    {currentHint && (
                      <button onClick={() => { requestHint(); clearHint(); }}
                        className="text-[11px] text-blue hover:underline mt-1">
                        Next hint →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-auto" />
          </div>
        </div>

        {/* Middle panel — answer */}
        <div className={clsx("p-4 lg:p-8 lg:pl-0", coachOpen ? "lg:w-[30%]" : "lg:w-[40%]")}>
          <div className="bg-bg-app rounded-card p-6 h-full flex flex-col gap-4 border border-border">
            <span className="label text-text-sec">Your Answer</span>

            <textarea
              id="answer-input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Start typing your answer…"
              className="flex-1 w-full min-h-[160px] sm:min-h-[240px] p-4 bg-surface border border-border rounded-xl
                         text-body text-text-pri placeholder:text-text-muted resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
            />

            <div className="flex justify-end">
              <span className="text-small text-text-muted">
                {answer.split(/\s+/).filter(Boolean).length} / ~300 recommended words
              </span>
            </div>

            {interimText && (
              <p className="text-small text-text-muted italic px-1">
                <span className="text-red-400">●</span> {interimText}
              </p>
            )}

            {/* STAR tracker — behavioral only */}
            {isBehavioral && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {STAR_LABELS.map((l) => (
                    <div
                      key={l}
                      className={clsx(
                        "flex-1 py-2 rounded-xl text-center font-mono font-bold text-[13px] transition-all",
                        star[l] ? "bg-[#22C55E] text-white" : "bg-surface border border-border text-text-muted"
                      )}
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <p className="text-small text-text-muted text-center">AI detects STAR structure as you write</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — AI Coach (collapsible) */}
        {coachOpen && (
          <div className="lg:w-[25%] p-4 lg:p-8 lg:pl-0">
            <div className="bg-surface border border-violet-200 rounded-card h-full flex flex-col overflow-hidden">
              {/* Coach header */}
              <div className="px-4 py-3 border-b border-violet-100 flex items-center gap-2 flex-shrink-0">
                <span className="material-symbols-outlined text-[18px] text-[#7C3AED]"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>support_agent</span>
                <p className="text-[13px] font-bold text-text-pri flex-1">AI Coach</p>
                <p className="text-[11px] text-text-muted">Ask for guidance</p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {coachMessages.length === 0 && (
                  <div className="text-center pt-4 space-y-2">
                    <span className="material-symbols-outlined text-[32px] text-[#7C3AED]/40"
                      style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>support_agent</span>
                    <p className="text-[12px] text-text-muted leading-relaxed">
                      Ask me anything — structure tips, how to tackle this question, or whether your answer is on track.
                    </p>
                    <div className="space-y-1.5 pt-1">
                      {["How should I structure my answer?", "What are they really looking for?", "Am I on the right track?"].map((s) => (
                        <button key={s} onClick={() => sendCoachMessage(s)}
                          className="w-full text-left text-[11px] text-[#7C3AED] bg-violet-50 hover:bg-violet-100 px-3 py-2 rounded-lg transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {coachMessages.map((msg, i) => (
                  <div key={i} className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={clsx(
                      "max-w-[85%] px-3 py-2 rounded-xl text-[12px] leading-relaxed",
                      msg.role === "user"
                        ? "bg-blue text-white rounded-br-none"
                        : "bg-violet-50 text-text-pri border border-violet-100 rounded-bl-none"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {coachTyping && (
                  <div className="flex justify-start">
                    <div className="bg-violet-50 border border-violet-100 px-3 py-2 rounded-xl rounded-bl-none flex gap-1 items-center">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={coachBottomRef} />
              </div>

              {/* Coach input */}
              <div className="p-3 border-t border-violet-100 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    value={coachInput}
                    onChange={(e) => setCoachInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && coachInput.trim()) {
                        e.preventDefault();
                        sendCoachMessage(coachInput.trim());
                        setCoachInput("");
                      }
                    }}
                    placeholder="Ask the coach…"
                    className="flex-1 h-9 px-3 bg-bg-app border border-border rounded-lg text-[12px] text-text-pri
                               placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
                  />
                  <button
                    onClick={() => { if (coachInput.trim()) { sendCoachMessage(coachInput.trim()); setCoachInput(""); } }}
                    disabled={!coachInput.trim() || coachTyping}
                    className="w-9 h-9 flex items-center justify-center bg-[#7C3AED] text-white rounded-lg disabled:opacity-40 hover:bg-[#6D28D9] transition-colors flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]"
                      style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>send</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      <footer className="bg-surface border-t border-border px-4 lg:px-8 py-3 sm:py-4 flex items-center gap-2 sm:gap-4 sticky bottom-0">
        <button
          onClick={passQuestion}
          disabled={aiTyping}
          className="flex-shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 border border-border rounded-btn text-[12px] sm:text-[14px] font-semibold text-text-sec hover:bg-bg-app transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="hidden sm:inline">Pass this question</span>
          <span className="sm:hidden">Pass</span>
        </button>

        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || aiTyping}
          className="flex-1 sm:flex-none sm:px-8 py-2.5 sm:py-3 btn-gradient text-white rounded-btn font-bold text-[14px] sm:text-[15px] shadow-blue-glow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {aiTyping ? "Generating…" : "Submit Answer"}
        </button>

        <div className="flex-shrink-0 flex flex-col items-end gap-1 ml-auto sm:ml-0">
          <button
            onClick={voiceEnabled ? toggleMic : undefined}
            disabled={!voiceEnabled}
            className={clsx(
              "flex items-center gap-1.5 text-small transition-colors",
              recording        ? "text-red-500 font-semibold"
              : voiceEnabled   ? "text-text-sec hover:text-text-pri"
              : "text-text-muted cursor-not-allowed opacity-50"
            )}
          >
            <span className={clsx("material-symbols-outlined text-[20px]", recording && "animate-pulse")}
              style={recording ? { fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" } : undefined}>
              {recording ? "mic" : voiceEnabled ? "mic" : "mic_off"}
            </span>
            <span className="hidden sm:inline">
              {recording ? "Recording…" : voiceEnabled ? "Voice" : "Voice off"}
            </span>
          </button>
        </div>

        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <button
            onClick={toggleCamera}
            className={clsx(
              "flex items-center gap-1.5 text-small transition-colors",
              camActive ? "text-blue font-semibold" : "text-text-sec hover:text-text-pri"
            )}
          >
            <span className="material-symbols-outlined text-[20px]"
              style={camActive ? { fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" } : undefined}>
              {camActive ? "videocam" : "videocam_off"}
            </span>
            <span className="hidden sm:inline">{camActive ? "Camera on" : "Camera"}</span>
          </button>
        </div>
      </footer>

      <CameraPreview stream={camStream} recording={camRecording} downloadUrl={camDownload} onStop={stopCamera} />

      {/* Permission error banners — shown above footer */}
      {(micError || camError) && (
        <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 space-y-2 pointer-events-none">
          {micError && (
            <div className="pointer-events-auto flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl shadow-lg">
              <span className="material-symbols-outlined text-[18px] text-red-500 flex-shrink-0 mt-0.5"
                style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>mic_off</span>
              <p className="text-[12px] leading-relaxed flex-1">{micError}</p>
              <button onClick={() => window.location.reload()}
                className="flex-shrink-0 text-[11px] font-bold text-red-600 hover:underline whitespace-nowrap">
                Reload
              </button>
            </div>
          )}
          {camError && (
            <div className="pointer-events-auto flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl shadow-lg">
              <span className="material-symbols-outlined text-[18px] text-red-500 flex-shrink-0 mt-0.5"
                style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>videocam_off</span>
              <p className="text-[12px] leading-relaxed flex-1">{camError}</p>
              <button onClick={() => window.location.reload()}
                className="flex-shrink-0 text-[11px] font-bold text-red-600 hover:underline whitespace-nowrap">
                Reload
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mid-session error toast */}
      {sessionError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg max-w-sm w-full mx-4">
          <span className="material-symbols-outlined text-[18px] flex-shrink-0"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>error</span>
          <p className="text-[13px] font-medium flex-1">{sessionError}</p>
          <button onClick={clearSessionError} className="text-red-400 hover:text-red-600 flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function InterviewSessionPage() {
  return (
    <Suspense>
      <InterviewSessionPageInner />
    </Suspense>
  );
}
