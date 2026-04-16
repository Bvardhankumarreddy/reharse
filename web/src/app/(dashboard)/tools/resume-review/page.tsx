"use client";

import { useState } from "react";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { ResumeReviewResponse } from "@/lib/api/client";

function scoreColor(score: number) {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-blue-500";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-green-50";
  if (score >= 60) return "bg-blue-50";
  if (score >= 40) return "bg-amber-50";
  return "bg-red-50";
}

function ScoreRing({ score, label, size = "lg" }: { score: number; label: string; size?: "lg" | "sm" }) {
  const r = size === "lg" ? 54 : 32;
  const stroke = size === "lg" ? 8 : 5;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={(r + stroke) * 2} height={(r + stroke) * 2} className="-rotate-90">
        <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={r + stroke} cy={r + stroke} r={r}
          fill="none"
          stroke={score >= 80 ? "#22c55e" : score >= 60 ? "#3b82f6" : score >= 40 ? "#f59e0b" : "#ef4444"}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: (r + stroke) * 2, height: (r + stroke) * 2 }}>
        <span className={`font-bold ${size === "lg" ? "text-3xl" : "text-lg"} ${scoreColor(score)}`}>{score}</span>
      </div>
      <span className="text-xs text-text-sec font-medium">{label}</span>
    </div>
  );
}

export default function ResumeReviewPage() {
  const { api, ready } = useApiClient();
  const [review, setReview] = useState<ResumeReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReview() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.reviewResume();
      setReview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to review resume");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-heading-l text-text-pri">Resume Review</h2>
          <p className="text-body text-text-sec mt-1">Get AI-powered feedback on your resume</p>
        </div>
        <button
          onClick={handleReview}
          disabled={loading || !ready}
          className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow disabled:opacity-50"
        >
          {loading ? "Analyzing..." : review ? "Re-analyze" : "Analyze My Resume"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 text-red-600 text-sm">{error}</div>
      )}

      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface border border-border rounded-card animate-pulse" />
          ))}
        </div>
      )}

      {review && !loading && (
        <>
          {/* Score Overview */}
          <div className="bg-surface border border-border rounded-card p-6">
            <div className="flex items-center gap-8 flex-wrap">
              <div className="relative">
                <ScoreRing score={review.overall_score} label="Overall" />
              </div>
              <div className="relative">
                <ScoreRing score={review.ats_score} label="ATS Score" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-text-pri text-body leading-relaxed">{review.summary}</p>
                {review.target_role_fit && (
                  <p className="text-text-sec text-small mt-2">{review.target_role_fit}</p>
                )}
              </div>
            </div>
          </div>

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-card p-5">
              <h3 className="text-text-pri font-semibold mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center text-green-500 text-xs">+</span>
                Strengths
              </h3>
              <ul className="space-y-2">
                {review.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-text-sec flex gap-2">
                    <span className="text-green-500 shrink-0">+</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-surface border border-border rounded-card p-5">
              <h3 className="text-text-pri font-semibold mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 text-xs">!</span>
                Areas to Improve
              </h3>
              <ul className="space-y-2">
                {review.improvements.map((s, i) => (
                  <li key={i} className="text-sm text-text-sec flex gap-2">
                    <span className="text-amber-500 shrink-0">-</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ATS Feedback */}
          <div className="bg-surface border border-border rounded-card p-5">
            <h3 className="text-text-pri font-semibold mb-2">ATS Compatibility</h3>
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-2 flex-1 rounded-full bg-gray-100 overflow-hidden`}>
                <div
                  className={`h-full rounded-full transition-all ${
                    review.ats_score >= 80 ? "bg-green-500" :
                    review.ats_score >= 60 ? "bg-blue-500" :
                    review.ats_score >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${review.ats_score}%` }}
                />
              </div>
              <span className={`font-bold text-sm ${scoreColor(review.ats_score)}`}>{review.ats_score}%</span>
            </div>
            <p className="text-sm text-text-sec">{review.ats_feedback}</p>
          </div>

          {/* Section-by-Section */}
          <div className="bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-text-pri font-semibold">Section Breakdown</h3>
            </div>
            <div className="divide-y divide-border">
              {review.sections.map((section) => (
                <div key={section.name} className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-text-pri font-medium">{section.name}</h4>
                    <span className={`text-sm font-bold ${scoreColor(section.score)}`}>{section.score}/100</span>
                  </div>
                  <p className="text-sm text-text-sec mb-3">{section.feedback}</p>
                  {section.suggestions.length > 0 && (
                    <div className="space-y-1.5">
                      {section.suggestions.map((sug, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-text-muted">
                          <span className="text-blue-500 shrink-0 mt-0.5">*</span>
                          <span>{sug}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!review && !loading && !error && (
        <div className="bg-surface border border-border rounded-card p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-text-muted mb-4 block">description</span>
          <h3 className="text-text-pri font-semibold text-lg mb-2">Review Your Resume</h3>
          <p className="text-text-sec text-sm max-w-md mx-auto">
            Upload your resume in Settings first, then click &quot;Analyze My Resume&quot; to get detailed
            AI-powered feedback on content, formatting, ATS compatibility, and more.
          </p>
        </div>
      )}
    </div>
  );
}
