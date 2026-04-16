"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface AuditItem {
  id: string;
  sessionId: string;
  overallScore: number;
  dimensionScores: Record<string, number>;
  summary: string;
  weakAreas: string[];
  modelUsed: string | null;
  questionCount: number;
  createdAt: string;
  session: { interviewType: string; status: string; targetRole: string | null } | null;
  user: { email: string; name: string | null } | null;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-blue-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-500/15";
  if (score >= 60) return "bg-blue-500/15";
  if (score >= 40) return "bg-amber-500/15";
  return "bg-red-500/15";
}

export default function FeedbackAuditPage() {
  const router = useRouter();
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (minScore) params.set("minScore", minScore);
    if (maxScore) params.set("maxScore", maxScore);
    const res = await fetch(`/api/v1/admin/feedback-audit?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setItems(json.data);
    setTotal(json.total);
    setPages(json.pages);
    setLoading(false);
  }, [token, page, minScore, maxScore]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [minScore, maxScore]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">Score range:</span>
          <input
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="Min"
            type="number"
            className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-20 focus:outline-none focus:border-indigo-500"
          />
          <span className="text-slate-500">—</span>
          <input
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            placeholder="Max"
            type="number"
            className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-20 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <span className="ml-auto text-slate-400 text-sm">{total} feedback reports</span>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 bg-[#1e293b] rounded-2xl animate-pulse" />
            ))
          : items.map((item) => (
              <div
                key={item.id}
                className="bg-[#1e293b] rounded-2xl p-5 border border-white/5 hover:border-white/10 transition cursor-pointer"
                onClick={() => router.push(`/admin/sessions/${item.sessionId}`)}
              >
                <div className="flex items-start gap-4">
                  {/* Score badge */}
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${scoreBg(item.overallScore)}`}>
                    <span className={`text-2xl font-bold ${scoreColor(item.overallScore)}`}>{item.overallScore}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {item.session && (
                        <span className="text-xs bg-white/5 text-slate-300 px-2 py-0.5 rounded-full capitalize">
                          {item.session.interviewType}
                        </span>
                      )}
                      {item.modelUsed && (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full">
                          {item.modelUsed}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{item.questionCount} questions</span>
                      <span className="text-xs text-slate-500 ml-auto">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-slate-300 text-sm line-clamp-2 mb-2">{item.summary}</p>

                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Dimension scores inline */}
                      {item.dimensionScores && Object.entries(item.dimensionScores).map(([dim, score]) => (
                        <span key={dim} className="text-xs text-slate-400">
                          <span className="capitalize">{dim}</span>:{" "}
                          <span className={scoreColor(score)}>{score}</span>
                        </span>
                      ))}
                    </div>

                    {item.weakAreas.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {item.weakAreas.map((a, i) => (
                          <span key={i} className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full">{a}</span>
                        ))}
                      </div>
                    )}

                    {item.user && (
                      <div className="text-xs text-slate-500 mt-2">
                        {item.user.name ?? item.user.email}
                        {item.session?.targetRole && <span className="ml-2">| {item.session.targetRole}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40">Prev</button>
          <span className="text-slate-400 text-sm">Page {page} of {pages}</span>
          <button disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
