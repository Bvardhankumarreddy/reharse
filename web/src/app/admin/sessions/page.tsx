"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ReviewSession {
  id: string;
  interviewType: string;
  mode: string;
  status: string;
  overallScore: number | null;
  targetRole: string | null;
  targetCompany: string | null;
  durationMinutes: number;
  completedAt: string | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
  hasFeedback: boolean;
  feedbackScore: number | null;
}

const TYPES = ["", "behavioral", "coding", "system-design", "hr", "case-study"];
const STATUSES = ["", "pending", "active", "completed", "abandoned"];

const typeColor: Record<string, string> = {
  behavioral: "bg-violet-500/15 text-violet-400",
  coding: "bg-sky-500/15 text-sky-400",
  "system-design": "bg-amber-500/15 text-amber-400",
  hr: "bg-emerald-500/15 text-emerald-400",
  "case-study": "bg-pink-500/15 text-pink-400",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-blue-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export default function AdminSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
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
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    const res = await fetch(`/api/v1/admin/sessions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setSessions(json.data);
    setTotal(json.total);
    setPages(json.pages);
    setLoading(false);
  }, [token, page, type, status, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, status, search]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user email or name..."
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All types</option>
          {TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-slate-400 text-sm self-center">{total} sessions</span>
      </div>

      {/* Table */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              : sessions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/admin/sessions/${s.id}`)}
                    className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-5 py-4">
                      <div className="text-white text-sm">{s.userName || "—"}</div>
                      <div className="text-slate-500 text-xs">{s.userEmail}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${typeColor[s.interviewType] ?? "bg-slate-500/15 text-slate-400"}`}>
                        {s.interviewType}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`capitalize text-sm ${
                        s.status === "completed" ? "text-emerald-400" :
                        s.status === "abandoned" ? "text-red-400" :
                        s.status === "active" ? "text-blue-400" :
                        "text-slate-400"
                      }`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-4">
                      {s.feedbackScore != null ? (
                        <span className={`font-semibold ${scoreColor(s.feedbackScore)}`}>
                          {s.feedbackScore}/100
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs">{s.targetRole ?? "—"}</td>
                    <td className="px-4 py-4 text-slate-400 text-xs">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40 hover:text-white transition"
          >
            Prev
          </button>
          <span className="text-slate-400 text-sm">Page {page} of {pages}</span>
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40 hover:text-white transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
