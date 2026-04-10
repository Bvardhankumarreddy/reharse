"use client";

// Spec § Screen 5: Post-Interview Feedback Report
// "Feels like a coach wrote this, not an algorithm."

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { getScoreBand, SCORE_BAND_BG, SCORE_BAND_COLOR } from "@/types";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { FeedbackResponse } from "@/lib/api/client";

// ── Sub-components ─────────────────────────────────────────────────────────────

function DimBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <span className="text-[13px] font-semibold text-text-pri">{label}</span>
        <span className="font-mono text-[13px] font-bold" style={{ color }}>{score}</span>
      </div>
      <div className="h-2 bg-bg-app rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ModelAnswer({ answer }: { answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-blue/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50/40 hover:bg-blue-50/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[16px] text-blue"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20" }}
          >
            lightbulb
          </span>
          <span className="text-[13px] font-semibold text-blue">View model answer</span>
        </div>
        <span
          className="material-symbols-outlined text-[16px] text-blue transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white border-t border-blue/10">
          <p className="text-[13px] text-text-pri leading-relaxed whitespace-pre-wrap">{answer}</p>
        </div>
      )}
    </div>
  );
}

const DIM_COLORS: Record<string, string> = {
  communication: "#3B82F6",
  structure:     "#7C3AED",
  depth:         "#F59E0B",
  examples:      "#22C55E",
  confidence:    "#3B82F6",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeedbackReportPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const { api, ready } = useApiClient();
  const [feedback,      setFeedback]      = useState<FeedbackResponse | null>(null);
  const [interviewType, setInterviewType] = useState<string>("behavioral");
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteSession(id);
      router.push("/sessions");
    } catch {
      setDeleting(false);
      setShowConfirm(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    Promise.all([
      api.getFeedbackBySession(id),
      api.getSession(id),
    ])
      .then(([fb, session]) => {
        setFeedback(fb);
        setInterviewType(session.interviewType);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load feedback"))
      .finally(() => setLoading(false));
  }, [api, ready, id]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-[860px] space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-card h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (error || !feedback) {
    return (
      <div className="max-w-[860px]">
        <div className="text-center py-20 space-y-3">
          <span className="material-symbols-outlined text-[48px] text-text-muted">feedback</span>
          <p className="text-[16px] font-semibold text-text-pri">
            {error ?? "Feedback report not found"}
          </p>
          <p className="text-text-sec text-sm">
            {!error && "The AI is still generating your report — check back shortly."}
          </p>
          <Link href="/sessions" className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-sm inline-block mt-2">
            Back to Sessions
          </Link>
        </div>
      </div>
    );
  }

  const score     = feedback.overallScore;
  const band      = getScoreBand(score);
  const scoreCls  = SCORE_BAND_BG[band];
  const [scoreBg, scoreText] = scoreCls.split(" ");
  const bandLabel = band === "strong" ? "Strong · Above Average" : band === "good" ? "Good · On Track" : band === "fair" ? "Fair · Room to Improve" : "Needs Work";
  const bandColor = SCORE_BAND_COLOR[band];

  const dimensions = Object.entries(feedback.dimensionScores).map(([key, val]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    score: Math.round(val),
    color: DIM_COLORS[key] ?? "#3B82F6",
  }));

  return (
    <div className="max-w-[860px] space-y-6">

      {/* Header */}
      <div className="bg-surface border border-border rounded-card p-5 sm:p-6 shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-heading-l text-text-pri">Session Complete</h2>
          <p className="text-body text-text-sec mt-1">
            {new Date(feedback.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Score badge */}
        <div className="flex flex-col items-center">
          <div className={clsx("w-20 h-20 rounded-full flex flex-col items-center justify-center border-4", scoreBg)} style={{ borderColor: bandColor }}>
            <span className={clsx("font-mono text-[28px] font-black", scoreText)}>{score}</span>
            <span className="text-[10px] text-text-muted">out of 100</span>
          </div>
          <span className={clsx("label mt-2", scoreText)} style={{ fontSize: 10 }}>{bandLabel}</span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap print:hidden">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 border border-border rounded-btn text-[13px] font-semibold text-text-sec hover:border-blue/40 transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}>download</span>
            Export PDF
          </button>
          <Link href="/sessions" className="px-4 py-2 border border-border rounded-btn text-[13px] font-semibold text-text-sec hover:border-blue/40 transition-colors">
            All Sessions
          </Link>
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 border border-red/30 rounded-btn text-[13px] font-semibold text-red hover:bg-red-50 transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
            Delete
          </button>
          <Link
            href={`/interview/setup?type=${interviewType}`}
            className="btn-gradient text-white px-4 py-2 rounded-btn text-[13px] font-semibold shadow-blue-glow flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>replay</span>
            Retake
          </Link>
        </div>
      </div>

      {/* Dimension bars */}
      {dimensions.length > 0 && (
        <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-5">
          <h3 className="text-heading-m text-text-pri">Performance Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-10 gap-y-4">
            {dimensions.map((d) => (
              <DimBar key={d.label} label={d.label} score={d.score} color={d.color} />
            ))}
          </div>
        </div>
      )}

      {/* AI summary */}
      {feedback.summary && (
        <div className="border-2 border-violet-200 bg-violet-50/40 rounded-card p-6 flex items-start gap-4">
          <span
            className="material-symbols-outlined text-[#7C3AED] text-[24px] flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
          >
            auto_awesome
          </span>
          <div>
            <p className="label text-[#7C3AED] mb-2">AI Analysis</p>
            <p className="text-body text-text-pri leading-relaxed">{feedback.summary}</p>
          </div>
        </div>
      )}

      {/* Question-by-question */}
      {feedback.questionFeedback?.length > 0 && (
        <div className="bg-surface border border-border rounded-card shadow-card overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="text-heading-m text-text-pri">Question-by-Question Review</h3>
          </div>
          {feedback.questionFeedback.map((q, i) => {
            const qBand  = getScoreBand(q.score);
            const qScore = SCORE_BAND_BG[qBand];

            return (
              <div key={q.questionId ?? i} className="border-b border-border last:border-b-0">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 p-4 sm:p-5">
                  <span className="label text-text-muted flex-shrink-0 mt-0.5 sm:mt-0" style={{ fontSize: 10 }}>Q{i + 1}</span>
                  <p className="flex-1 text-[13px] sm:text-[14px] font-semibold text-text-pri leading-snug">{q.question}</p>
                  <span className={clsx("font-mono text-[12px] sm:text-[13px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full flex-shrink-0", qScore)}>
                    {q.score}
                  </span>
                </div>

                {(q.strengths?.length > 0 || q.improvements?.length > 0 || q.modelAnswer) && (
                  <div className="px-5 pb-5 space-y-3">
                    <div className="p-4 bg-violet-50 rounded-xl space-y-2.5">
                      {q.strengths?.map((s, si) => (
                        <div key={si} className="flex items-start gap-2.5">
                          <span className="text-[16px] flex-shrink-0 mt-0.5">✅</span>
                          <p className="text-small text-text-pri leading-relaxed">{s}</p>
                        </div>
                      ))}
                      {q.improvements?.map((s, si) => (
                        <div key={si} className="flex items-start gap-2.5">
                          <span className="text-[16px] flex-shrink-0 mt-0.5">❌</span>
                          <p className="text-small text-text-pri leading-relaxed">{s}</p>
                        </div>
                      ))}
                    </div>
                    {q.modelAnswer && (
                      <ModelAnswer answer={q.modelAnswer} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Next steps */}
      {feedback.nextSteps?.length > 0 && (
        <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
          <h3 className="text-heading-m text-text-pri">Your Next Steps</h3>
          <div className="space-y-3">
            {feedback.nextSteps.map((step) => (
              <div key={step.title} className="flex items-start sm:items-center gap-3 sm:gap-4 p-4 border border-blue/30 bg-blue-50/30 rounded-xl">
                <span
                  className="material-symbols-outlined text-blue text-[22px] flex-shrink-0"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
                >
                  {step.type === "practice" ? "fitness_center" : step.type === "read" ? "menu_book" : "arrow_forward"}
                </span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-text-pri">{step.title}</p>
                  {step.description && (
                    <p className="text-[13px] text-text-sec mt-0.5">{step.description}</p>
                  )}
                </div>
                {step.link ? (
                  <Link href={step.link} className="btn-gradient text-white px-4 py-1.5 rounded-btn text-[13px] font-semibold shadow-blue-glow flex-shrink-0">
                    Start
                  </Link>
                ) : (
                  <Link href="/interview/setup" className="btn-gradient text-white px-4 py-1.5 rounded-btn text-[13px] font-semibold shadow-blue-glow flex-shrink-0">
                    Start
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="text-[15px] font-bold text-text-pri">Delete this session?</p>
            <p className="text-[13px] text-text-sec">This will permanently remove the session and its feedback report. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-btn text-[13px] font-semibold border border-border text-text-sec hover:text-text-pri transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-btn text-[13px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
