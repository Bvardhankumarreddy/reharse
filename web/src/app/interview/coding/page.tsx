"use client";

// Spec § Screen 4: Live Interview — Coding Mode
// "VS Code meets Google interview. Dark editor right, clean white left."

import { useState, Suspense, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";
import { useInterviewSocket, fmtMs } from "@/lib/hooks/useInterviewSocket";
import { useVoiceRecorder } from "@/lib/hooks/useVoiceRecorder";
import { useCameraRecorder } from "@/lib/hooks/useCameraRecorder";
import CameraPreview from "@/components/CameraPreview";

// Monaco must be loaded client-side only
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ── Starter code per language ─────────────────────────────────────────────────

const STARTER: Record<string, string> = {
  python: `# Write your solution here\ndef solution():\n    pass\n`,
  javascript: `// Write your solution here\nfunction solution() {\n\n}\n`,
  java: `// Write your solution here\nclass Solution {\n\n}\n`,
};

// ── Shared loading / error screens (mirrors session/page.tsx) ─────────────────

function LoadingScreen({ connected }: { connected: boolean }) {
  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#3B82F6] animate-pulse" />
        <p className="text-[16px] font-semibold text-text-pri">
          {connected ? "Loading your coding problem…" : "Connecting…"}
        </p>
        <p className="text-text-sec text-sm">AI is preparing a problem for your role</p>
      </div>
    </div>
  );
}

function EndedScreen({ sessionId, router }: { sessionId: string | null; router: ReturnType<typeof useRouter> }) {
  const { api, ready } = useApiClient();
  const [phase, setPhase] = useState<"waiting" | "slow" | "timeout">("waiting");

  useEffect(() => {
    if (!ready || !sessionId) return;
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
            <p className="text-text-sec text-sm">The report is still being generated. You can check back in a moment.</p>
            <button
              onClick={() => sessionId && router.push(`/sessions/${sessionId}`)}
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

function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <span className="material-symbols-outlined text-[48px] text-red-400">error</span>
        <p className="text-[16px] font-semibold text-text-pri">Connection failed</p>
        <p className="text-text-sec text-sm">{message}</p>
        <button onClick={onBack} className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-sm">
          Start over
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function CodingInterviewPageInner() {
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
  const role      = params.get("role") ?? "Software Engineer";

  const [lang,       setLang]       = useState("python");
  const [code,       setCode]       = useState(STARTER.python);
  const [chatInput,  setChatInput]  = useState("");
  const [activeTab,  setActiveTab]  = useState<"cases" | "console">("cases");
  const [hintOpen,   setHintOpen]   = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  const handleFeedbackReady = useCallback((_feedbackId: string) => {
    router.push(`/sessions/${sessionId}`);
  }, [router, sessionId]);

  const {
    connected, question, questionIndex, totalQuestions,
    elapsed, remaining, ended, aiTyping, wsError, sessionError,
    submitAnswer, passQuestion, requestHint, endSession, clearSessionError,
    coachMessages, coachTyping, sendCoachMessage,
  } = useInterviewSocket(sessionId, getToken, handleFeedbackReady);

  // Voice — interim shows in placeholder, final is committed to chatInput
  const [interimText, setInterimText] = useState("");

  const { recording, micError, toggle: toggleMic } = useVoiceRecorder(
    (interim) => setInterimText(interim),
    (final)   => { setChatInput((prev) => prev ? `${prev} ${final}` : final); setInterimText(""); },
  );

  const { active: camActive, stream: camStream, recording: camRecording,
          downloadUrl: camDownload, camError, toggleCamera, stopCamera,
        } = useCameraRecorder();

  // Reset editor when a new adaptive question arrives
  const prevQuestionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!question || question.questionId === prevQuestionIdRef.current) return;
    const isFirst = prevQuestionIdRef.current === null;
    prevQuestionIdRef.current = question.questionId;
    if (!isFirst) {
      setSubmitted(false);
      setCode(STARTER[lang] ?? "");
    }
  }, [question, lang]);

  // Build chat display: initial question bubble + all coach/user exchanges
  const displayMessages: { role: "ai" | "user"; text: string }[] = [
    ...(question ? [{ role: "ai" as const, text: question.question }] : []),
    ...coachMessages.map((m) => ({ role: m.role === "coach" ? "ai" as const : "user" as const, text: m.text })),
  ];

  function switchLang(l: string) {
    setLang(l);
    setCode(STARTER[l] ?? "");
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    sendCoachMessage(chatInput.trim());
    setChatInput("");
  }

  function handleSubmitCode() {
    submitAnswer(code);
    setSubmitted(true);
  }

  function handleHint() {
    setHintOpen((o) => !o);
    if (!hintOpen) requestHint();
  }

  const timerColor = remaining > 0 && remaining < 60_000 ? "text-red-500" : "text-[#0EA5E9]";

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!sessionId) {
    return <ErrorScreen message="No session found. Please start from the setup wizard." onBack={() => router.push("/interview/setup")} />;
  }
  if (wsError)              return <ErrorScreen message={wsError} onBack={() => router.push("/interview/setup")} />;
  if (!connected || !question) return <LoadingScreen connected={connected} />;
  if (ended)                return <EndedScreen sessionId={sessionId} router={router} />;

  return (
    <div className="min-h-screen bg-bg-app flex flex-col">

      {/* ── Top bar ── */}
      <header className="bg-surface border-b border-border px-4 lg:px-6 h-14 flex items-center justify-between gap-4 sticky top-0 z-40 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-teal-50 text-[#0EA5E9] rounded-full label" style={{ fontSize: 10 }}>
            Coding Interview
          </span>
          <span className="text-small text-text-sec hidden sm:block truncate max-w-[200px]">{role}</span>
        </div>

        <span className={clsx("font-mono text-[20px] font-bold", timerColor)}>
          {elapsed > 0 ? fmtMs(elapsed) : "00:00"}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-small text-text-sec hidden sm:block">
            Q {questionIndex + 1}/{totalQuestions}
          </span>
          <button
            onClick={handleSubmitCode}
            disabled={submitted || aiTyping}
            className="px-3 py-1.5 btn-gradient text-white rounded-lg text-[12px] font-semibold shadow-blue-glow disabled:opacity-60"
          >
            {aiTyping ? "Generating…" : submitted ? "Submitted ✓" : "Submit"}
          </button>
          <button
            onClick={toggleCamera}
            title={camActive ? "Turn off camera" : "Turn on camera"}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors hidden sm:flex items-center gap-1",
              camActive ? "bg-blue/10 text-blue" : "border border-border text-text-sec hover:text-text-pri"
            )}
          >
            <span className="material-symbols-outlined text-[14px]"
              style={camActive ? { fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" } : undefined}>
              {camActive ? "videocam" : "videocam_off"}
            </span>
            {camActive ? "Cam on" : "Camera"}
          </button>
          <button
            onClick={endSession}
            className="px-3 py-1.5 border border-red/40 text-red rounded-lg text-[12px] font-semibold hover:bg-red-50 transition-colors hidden sm:block"
          >
            End
          </button>
        </div>
      </header>

      {/* ── Two-column main ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left: problem + AI chat ── */}
        <div className="lg:w-1/2 flex flex-col bg-surface border-r border-border overflow-y-auto">

          {/* Problem */}
          <div className="p-5 border-b border-border space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label text-[#0EA5E9]" style={{ fontSize: 10 }}>
                {(question.category ?? "coding").toUpperCase()}
              </span>
            </div>
            <p className="text-[16px] sm:text-[18px] font-semibold text-text-pri leading-relaxed">
              {question.question}
            </p>

            {/* Hints */}
            <div>
              <button
                onClick={handleHint}
                className="flex items-center gap-2 text-small text-text-sec font-semibold hover:text-text-pri transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {hintOpen ? "expand_less" : "lightbulb"}
                </span>
                {hintOpen ? "Hide hints" : "Show hints"}
              </button>
              {hintOpen && question.hints?.length > 0 && (
                <div className="mt-3 p-4 bg-bg-app rounded-xl space-y-2">
                  {question.hints.map((hint: string, i: number) => (
                    <p key={i} className="text-small text-text-sec">• {hint}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AI Chat */}
          <div className="flex-1 flex flex-col bg-bg-app">
            <div className="px-5 pt-4 pb-2">
              <span className="label text-[#7C3AED]" style={{ fontSize: 10 }}>INTERVIEWER</span>
            </div>
            <div className="flex-1 px-5 pb-4 space-y-3 overflow-y-auto">
              {displayMessages.map((m, i) => (
                <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={clsx(
                    "max-w-[85%] px-4 py-2.5 rounded-xl text-small leading-relaxed",
                    m.role === "ai"
                      ? "bg-surface border-l-2 border-[#7C3AED] text-text-pri"
                      : "bg-surface border-l-2 border-[#3B82F6] text-text-pri"
                  )}>
                    {m.text}
                  </div>
                </div>
              ))}
              {coachTyping && (
                <div className="flex justify-start">
                  <div className="bg-surface border-l-2 border-[#7C3AED] px-4 py-3 rounded-xl flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 pb-4">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder={interimText || (recording ? "Listening…" : "Reply to interviewer…")}
                  className="flex-1 h-9 px-3 bg-surface border border-border rounded-lg
                             text-small text-text-pri placeholder:text-text-muted
                             focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
                />
                <button
                  onClick={toggleMic}
                  title={recording ? "Stop recording" : "Start voice input"}
                  className={clsx(
                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                    recording ? "bg-red-500 text-white" : "bg-surface border border-border text-text-sec hover:text-text-pri"
                  )}
                >
                  <span className={clsx("material-symbols-outlined text-[16px]", recording && "animate-pulse")}
                    style={recording ? { fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" } : undefined}>
                    mic
                  </span>
                </button>
                <button
                  onClick={sendChat}
                  className="w-9 h-9 btn-gradient text-white rounded-lg flex items-center justify-center flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]"
                    style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>send</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Monaco editor ── */}
        <div className="lg:w-1/2 flex flex-col bg-[#1E2330]">

          {/* Editor toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#151820] border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-2">
              {["python", "javascript", "java"].map((l) => (
                <button key={l} onClick={() => switchLang(l)}
                  className={clsx(
                    "px-3 py-1 rounded text-[12px] font-semibold transition-colors",
                    lang === l ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
                  )}
                >
                  {l === "javascript" ? "JavaScript" : l.charAt(0).toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={passQuestion}
                className="text-[12px] text-white/50 hover:text-white/80 font-semibold transition-colors"
              >
                Skip →
              </button>
              <button
                onClick={() => setCode(STARTER[lang] ?? "")}
                className="text-[12px] text-white/50 hover:text-white/80 font-semibold transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Monaco */}
          <div className="flex-1 min-h-0">
            <MonacoEditor
              height="100%"
              language={lang === "javascript" ? "javascript" : lang === "java" ? "java" : "python"}
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v ?? "")}
              options={{
                fontSize: 14,
                fontFamily: "JetBrains Mono, Fira Code, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                lineNumbers: "on",
                renderLineHighlight: "line",
                bracketPairColorization: { enabled: true },
                wordWrap: "on",
              }}
            />
          </div>

          {/* Console panel */}
          <div className="bg-[#151820] border-t border-white/10 flex-shrink-0" style={{ minHeight: 120 }}>
            <div className="flex items-center gap-1 px-4 pt-2 border-b border-white/10">
              {(["cases", "console"] as const).map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={clsx(
                    "px-3 py-1.5 text-[12px] font-semibold transition-colors rounded-t",
                    activeTab === t ? "text-white border-b-2 border-[#0EA5E9]" : "text-white/50 hover:text-white/80"
                  )}
                >
                  {t === "cases" ? "Test Cases" : "Console"}
                </button>
              ))}
            </div>
            <div className="px-4 py-3">
              {activeTab === "cases" ? (
                submitted ? (
                  aiTyping ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-[#0EA5E9] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      <p className="text-[#0EA5E9] text-[12px] font-mono">AI is generating the next problem…</p>
                    </div>
                  ) : (
                    <p className="text-[#22C55E] text-[12px] font-mono">Solution submitted — awaiting AI evaluation…</p>
                  )
                ) : (
                  <p className="text-white/40 text-[12px] font-mono">Submit your solution to run test cases.</p>
                )
              ) : (
                <p className="text-white/40 text-[12px] font-mono">Run your code to see output here.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="bg-surface border-t border-border px-4 lg:px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0 lg:hidden">
        <button
          onClick={endSession}
          className="px-4 py-2 border border-red/40 text-red rounded-btn text-[13px] font-semibold hover:bg-red-50 transition-colors"
        >
          End Interview
        </button>
        <button
          onClick={handleSubmitCode}
          disabled={submitted || aiTyping}
          className="flex-1 py-2.5 btn-gradient text-white rounded-btn font-bold text-[14px] shadow-blue-glow disabled:opacity-60"
        >
          {aiTyping ? "Generating…" : submitted ? "Submitted ✓" : "Submit Solution"}
        </button>
      </footer>

      {/* Permission error banners */}
      {micError && (
        <div className="fixed bottom-[72px] lg:bottom-4 left-4 right-4 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg max-w-md mx-auto">
          <span className="material-symbols-outlined text-[20px] flex-shrink-0"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>mic_off</span>
          <p className="text-[13px] font-medium flex-1">{micError}</p>
          <button onClick={() => window.location.reload()} className="text-[12px] font-semibold underline flex-shrink-0">Reload</button>
        </div>
      )}
      {camError && !micError && (
        <div className="fixed bottom-[72px] lg:bottom-4 left-4 right-4 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg max-w-md mx-auto">
          <span className="material-symbols-outlined text-[20px] flex-shrink-0"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>videocam_off</span>
          <p className="text-[13px] font-medium flex-1">{camError}</p>
          <button onClick={() => window.location.reload()} className="text-[12px] font-semibold underline flex-shrink-0">Reload</button>
        </div>
      )}

      {/* Picture-in-picture camera preview */}
      <CameraPreview
        stream={camStream}
        recording={camRecording}
        downloadUrl={camDownload}
        onStop={stopCamera}
      />

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

export default function CodingInterviewPage() {
  return (
    <Suspense>
      <CodingInterviewPageInner />
    </Suspense>
  );
}
