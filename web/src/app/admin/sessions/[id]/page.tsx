"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface SessionDetail {
  id: string;
  interviewType: string;
  mode: string;
  status: string;
  overallScore: number | null;
  targetRole: string | null;
  targetCompany: string | null;
  durationMinutes: number;
  transcript: Array<{ questionId?: string; question?: string; answer?: string; score?: number; feedback?: string }> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  feedback: {
    id: string;
    overallScore: number;
    dimensionScores: Record<string, number>;
    summary: string;
    questionFeedback: Array<{
      questionId: string; question: string; answer: string; score: number;
      strengths: string[]; improvements: string[];
    }>;
    weakAreas: string[];
    modelUsed: string | null;
  } | null;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-blue-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-500/15 border-emerald-500/20";
  if (score >= 60) return "bg-blue-500/15 border-blue-500/20";
  if (score >= 40) return "bg-amber-500/15 border-amber-500/20";
  return "bg-red-500/15 border-red-500/20";
}

export default function SessionDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/admin/sessions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setData);
  }, [id, token]);

  if (!data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-[#1e293b] rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const fb = data.feedback;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to sessions
      </button>

      {/* Header */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-white font-bold text-lg capitalize">{data.interviewType} Interview</h2>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
                data.status === "completed" ? "bg-emerald-500/15 text-emerald-400" :
                data.status === "abandoned" ? "bg-red-500/15 text-red-400" :
                "bg-slate-500/15 text-slate-400"
              }`}>{data.status}</span>
              <span className="text-xs bg-white/5 text-slate-400 px-2 py-1 rounded-full">{data.mode}</span>
            </div>
            <div className="text-slate-400 text-sm">
              {data.user.firstName || data.user.lastName
                ? `${data.user.firstName ?? ""} ${data.user.lastName ?? ""}`.trim()
                : data.user.email}
              <span className="text-slate-500 ml-2">({data.user.email})</span>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              {data.targetRole && <span>Role: {data.targetRole}</span>}
              {data.targetCompany && <span>Company: {data.targetCompany}</span>}
              <span>{data.durationMinutes} min</span>
              <span>{new Date(data.createdAt).toLocaleString()}</span>
            </div>
          </div>
          {fb && (
            <div className={`text-center px-6 py-3 rounded-2xl border ${scoreBg(fb.overallScore)}`}>
              <div className={`text-3xl font-bold ${scoreColor(fb.overallScore)}`}>{fb.overallScore}</div>
              <div className="text-slate-400 text-xs mt-1">Overall Score</div>
            </div>
          )}
        </div>
      </div>

      {/* Dimension Scores */}
      {fb && fb.dimensionScores && (
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <h3 className="text-white font-semibold mb-4">Dimension Scores</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(fb.dimensionScores).map(([dim, score]) => (
              <div key={dim} className="text-center">
                <div className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
                <div className="text-slate-400 text-xs mt-1 capitalize">{dim}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {fb && (
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">AI Summary</h3>
            {fb.modelUsed && <span className="text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{fb.modelUsed}</span>}
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">{fb.summary}</p>
          {fb.weakAreas.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {fb.weakAreas.map((area, i) => (
                <span key={i} className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded-full">{area}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Question-by-Question Feedback */}
      {fb && fb.questionFeedback.length > 0 && (
        <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-white font-semibold">Question Feedback ({fb.questionFeedback.length})</h3>
          </div>
          <div className="divide-y divide-white/5">
            {fb.questionFeedback.map((qf, i) => (
              <div key={i} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="text-white font-medium text-sm mb-1">Q{i + 1}: {qf.question}</div>
                  </div>
                  <span className={`text-lg font-bold ml-4 ${scoreColor(qf.score)}`}>{qf.score}/100</span>
                </div>
                <div className="bg-white/3 rounded-xl p-3 mb-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Answer</div>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{qf.answer}</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {qf.strengths.length > 0 && (
                    <div>
                      <div className="text-emerald-400 text-xs font-medium mb-1">Strengths</div>
                      <ul className="space-y-1">
                        {qf.strengths.map((s, j) => (
                          <li key={j} className="text-slate-400 text-xs flex gap-1.5">
                            <span className="text-emerald-400 shrink-0">+</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {qf.improvements.length > 0 && (
                    <div>
                      <div className="text-amber-400 text-xs font-medium mb-1">Improvements</div>
                      <ul className="space-y-1">
                        {qf.improvements.map((im, j) => (
                          <li key={j} className="text-slate-400 text-xs flex gap-1.5">
                            <span className="text-amber-400 shrink-0">-</span> {im}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Transcript */}
      {data.transcript && data.transcript.length > 0 && !fb && (
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <h3 className="text-white font-semibold mb-4">Transcript</h3>
          <div className="space-y-3">
            {data.transcript.map((t, i) => (
              <div key={i} className="border-l-2 border-indigo-500/30 pl-4">
                {t.question && <div className="text-indigo-300 text-sm font-medium mb-1">{t.question}</div>}
                {t.answer && <div className="text-slate-300 text-sm">{t.answer}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
