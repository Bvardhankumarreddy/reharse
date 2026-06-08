"use client";

import { useEffect, useState, useCallback } from "react";

interface SuspicionFlag {
  code: string;
  reason: string;
  points: number;
}

interface Submission {
  id: string;
  fullName: string;
  email: string;
  upiId: string;
  youtubeHandle: string | null;
  quizWeek: number;
  totalScore: number;
  totalTimeSeconds: number;
  tiebreakerAnswer: number | null;
  winnerRank: number | null;
  submittedAt: string;
  disqualified?: boolean;
  disqualifiedReason?: string | null;
  suspicionScore?: number;
  suspicionFlags?: SuspicionFlag[];
}

export default function AdminQuizSubmissionsPage() {
  const [data, setData] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [quizWeek, setQuizWeek] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "time" | "submittedAt">("score");
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
    const params = new URLSearchParams({ page: String(page), limit: "50", sortBy });
    if (quizWeek) params.set("quizWeek", quizWeek);
    if (search) params.set("search", search);
    const res = await fetch(`/api/v1/admin/quiz/submissions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setData(json.data);
    setTotal(json.total);
    setPages(json.pages);
    setLoading(false);
  }, [token, page, quizWeek, search, sortBy]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [quizWeek, search, sortBy]);

  async function markWinner(id: string, rank: number | null) {
    if (!token) return;
    await fetch(`/api/v1/admin/quiz/submissions/${id}/winner`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rank }),
    });
    void load();
  }

  async function disqualify(id: string, currentName: string) {
    if (!token) return;
    const reason = prompt(
      `Disqualify ${currentName}? Reason (optional, shown in CSV audit):`,
      "",
    );
    if (reason === null) return;   // user cancelled
    await fetch(`/api/v1/admin/quiz/submissions/${id}/disqualify`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    void load();
  }

  async function reinstate(id: string) {
    if (!token) return;
    if (!confirm("Reinstate this submission? They'll reappear on the public leaderboard.")) return;
    await fetch(`/api/v1/admin/quiz/submissions/${id}/reinstate`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    void load();
  }

  function suspicionPill(s: Submission) {
    const score = s.suspicionScore ?? 0;
    if (score === 0) return null;
    const tier =
      score >= 50 ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
      : score >= 25 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-slate-500/10 text-slate-400 border-slate-500/20";
    const codes = (s.suspicionFlags ?? []).map((f) => f.code).join(", ");
    return (
      <span
        title={(s.suspicionFlags ?? []).map((f) => f.reason).join("\n") || codes}
        className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${tier}`}
      >
        🚩 {score}
      </span>
    );
  }

  async function exportCSV() {
    if (!token) return;
    const params = new URLSearchParams();
    if (quizWeek) params.set("quizWeek", quizWeek);
    const res = await fetch(`/api/v1/admin/quiz/submissions/export?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rehearse_submissions_${quizWeek || "all"}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function rankBadge(rank: number | null) {
    if (!rank) return null;
    const colors = ["bg-amber-500/20 text-amber-400", "bg-slate-400/20 text-slate-300", "bg-orange-500/20 text-orange-400"];
    const emojis = ["🥇", "🥈", "🥉"];
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[rank - 1] ?? "bg-slate-500/20 text-slate-400"}`}>
        {emojis[rank - 1] ?? ""} #{rank}
      </span>
    );
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, UPI..."
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
        />
        <input
          value={quizWeek}
          onChange={(e) => setQuizWeek(e.target.value)}
          placeholder="Week"
          type="number"
          className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-24"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "score" | "time" | "submittedAt")}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none"
        >
          <option value="score">Sort: Score DESC, Time ASC</option>
          <option value="time">Sort: Fastest Time</option>
          <option value="submittedAt">Sort: Newest First</option>
        </select>
        <button
          onClick={exportCSV}
          className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition"
        >
          Export CSV
        </button>
        <span className="text-slate-400 text-sm self-center">{total} submissions</span>
      </div>

      {/* Table */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium">Rank</th>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">UPI</th>
              <th className="text-left px-4 py-3 font-medium">Week</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Time</th>
              <th className="text-left px-4 py-3 font-medium">Tiebreaker</th>
              <th className="text-left px-4 py-3 font-medium">Submitted</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              : data.map((s, i) => (
                  <tr
                    key={s.id}
                    className={
                      "border-b border-white/5 last:border-0 hover:bg-white/3 " +
                      (s.disqualified ? "opacity-40 line-through" : "")
                    }
                  >
                    <td className="px-5 py-3">
                      {s.winnerRank ? rankBadge(s.winnerRank) : <span className="text-slate-500 text-xs">#{i + 1}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm">{s.fullName}</span>
                        {suspicionPill(s)}
                        {s.disqualified && (
                          <span
                            title={s.disqualifiedReason ?? "Disqualified"}
                            className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-500/15 text-red-300 border-red-500/40 whitespace-nowrap"
                          >
                            ✕ DQ
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-xs">{s.email}</div>
                      {s.youtubeHandle && (
                        <div className="text-rose-400 text-[10px]">{s.youtubeHandle}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{s.upiId}</td>
                    <td className="px-4 py-3 text-slate-300">W{s.quizWeek}</td>
                    <td className="px-4 py-3">
                      <span className="text-emerald-400 font-bold">{s.totalScore}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs tabular-nums">{formatTime(s.totalTimeSeconds)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{s.tiebreakerAnswer ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(s.submittedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center">
                        {[1, 2, 3].map((r) => (
                          <button
                            key={r}
                            onClick={() => markWinner(s.id, s.winnerRank === r ? null : r)}
                            disabled={s.disqualified}
                            className={`w-6 h-6 text-[10px] font-bold rounded transition disabled:opacity-30 disabled:cursor-not-allowed ${
                              s.winnerRank === r
                                ? "bg-amber-500 text-white"
                                : "bg-white/5 text-slate-400 hover:bg-amber-500/30 hover:text-amber-300"
                            }`}
                            title={`Mark as ${r}${["st", "nd", "rd"][r - 1]}`}
                          >
                            {r}
                          </button>
                        ))}
                        {!s.disqualified && (
                          <button
                            onClick={() => disqualify(s.id, s.fullName)}
                            className="ml-1 px-1.5 h-6 text-[10px] font-bold rounded bg-red-500/10 text-red-300 hover:bg-red-500/30 transition"
                            title="Disqualify this entry — hides from public leaderboard"
                          >
                            DQ
                          </button>
                        )}
                        {s.disqualified && (
                          <button
                            onClick={() => reinstate(s.id)}
                            className="ml-1 px-1.5 h-6 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/30 transition"
                            title="Reinstate — re-show on public leaderboard"
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
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
