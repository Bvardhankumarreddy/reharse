"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { getScoreBand, SCORE_BAND_BG, INTERVIEW_BG } from "@/types";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { SessionResponse } from "@/lib/api/client";

const TYPE_ICON: Record<string, string> = {
  coding: "psychology", behavioral: "chat", "system-design": "account_tree", hr: "handshake", "case-study": "lightbulb",
};
const TYPE_LABEL: Record<string, string> = {
  coding: "Coding", behavioral: "Behavioral", "system-design": "System Design", hr: "HR", "case-study": "Case Study",
};

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

const TYPES = ["All", "Behavioral", "Coding", "System Design", "HR", "Case Study"] as const;
const TYPE_KEY: Record<string, string> = {
  "Behavioral": "behavioral", "Coding": "coding",
  "System Design": "system-design", "HR": "hr", "Case Study": "case-study",
};

export default function SessionsPage() {
  const { api, ready } = useApiClient();
  const [all,         setAll]         = useState<SessionResponse[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [filter,      setFilter]      = useState<typeof TYPES[number]>("All");
  const [search,      setSearch]      = useState("");
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState(false);

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.deleteSession(id);
      setAll((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // silently ignore — row stays
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  }

  useEffect(() => {
    if (!ready) return;
    api.getSessions()
      .then((data) => setAll(data.filter((s) => s.status === "completed")))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, [api, ready]);

  const sessions = all.filter((s) => {
    const typeMatch = filter === "All" || s.interviewType === TYPE_KEY[filter];
    const q = search.toLowerCase();
    const searchMatch = !q
      || (s.targetRole ?? "").toLowerCase().includes(q)
      || (s.interviewType).toLowerCase().includes(q)
      || (s.targetCompany ?? "").toLowerCase().includes(q);
    return typeMatch && searchMatch;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-heading-l text-text-pri">My Sessions</h2>
          <p className="text-body text-text-sec mt-1">
            {loading ? "Loading…" : `${all.length} session${all.length !== 1 ? "s" : ""} completed`}
          </p>
        </div>
        <Link
          href="/interview/setup"
          className="btn-gradient text-white px-5 py-2.5 rounded-btn font-semibold text-[14px]
                     flex items-center gap-2 shadow-blue-glow hover:-translate-y-0.5 transition-all self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>add</span>
          New Interview
        </Link>
      </div>

      {/* Search + type filter */}
      {!loading && all.length > 0 && (
        <div className="space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by role, type, or company…"
            className="w-full h-10 px-4 bg-surface border border-border rounded-btn text-[14px] text-text-pri
                       placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
          />
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={clsx(
                  "px-3 py-1 rounded-full text-[12px] font-semibold transition-all",
                  filter === t
                    ? "bg-blue text-white"
                    : "bg-surface border border-border text-text-sec hover:border-blue/40"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-600">{error}</div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-border rounded-xl px-4 py-3.5 h-16 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state — no sessions at all */}
      {!loading && !error && all.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <span className="material-symbols-outlined text-[48px] text-text-muted">history</span>
          <p className="text-[16px] font-semibold text-text-pri">No sessions yet</p>
          <p className="text-text-sec text-sm">Complete your first interview to see it here.</p>
          <Link href="/interview/setup" className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-sm inline-block mt-2">
            Start Interview
          </Link>
        </div>
      )}

      {/* Empty state — no filter matches */}
      {!loading && !error && all.length > 0 && sessions.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <span className="material-symbols-outlined text-[40px] text-text-muted">search_off</span>
          <p className="text-[14px] font-semibold text-text-pri">No sessions match your filter</p>
          <button onClick={() => { setFilter("All"); setSearch(""); }} className="text-[13px] text-blue hover:underline">
            Clear filters
          </button>
        </div>
      )}

      {/* Session list */}
      {!loading && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((s) => {
            const score    = s.overallScore ?? 0;
            const band     = getScoreBand(score);
            const scoreCls = SCORE_BAND_BG[band];
            const typeCls  = INTERVIEW_BG[s.interviewType as keyof typeof INTERVIEW_BG] ?? "bg-gray-50 text-gray-600";
            const [bgCls, textCls] = typeCls.split(" ");
            const title = `${TYPE_LABEL[s.interviewType] ?? s.interviewType} Interview${s.targetRole ? ` — ${s.targetRole}` : ""}`;

            return (
              <div key={s.id} className="group relative">
                <Link
                  href={`/sessions/${s.id}`}
                  className="bg-surface border border-border rounded-xl px-4 py-3.5
                             flex items-center gap-3 hover:shadow-card transition-shadow pr-12"
                >
                  <div className={clsx("w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0", bgCls)}>
                    <span className={clsx("material-symbols-outlined text-[18px] sm:text-[20px]", textCls)}>
                      {TYPE_ICON[s.interviewType] ?? "quiz"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] sm:text-[14px] font-semibold text-text-pri truncate">{title}</p>
                    <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 mt-0.5">
                      <span className="text-small text-text-muted">
                        {ago(s.createdAt)} · {s.durationMinutes} min
                      </span>
                      <span className={clsx("px-2 py-0.5 rounded-full label hidden sm:inline", typeCls)} style={{ fontSize: 10 }}>
                        {TYPE_LABEL[s.interviewType] ?? s.interviewType}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {score > 0 && (
                      <span className={clsx("font-mono text-[12px] sm:text-[13px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full", scoreCls)}>
                        {score}
                      </span>
                    )}
                    <span className="material-symbols-outlined text-text-muted text-[18px]">chevron_right</span>
                  </div>
                </Link>
                {/* Delete button — revealed on hover */}
                <button
                  onClick={(e) => { e.preventDefault(); setConfirmId(s.id); }}
                  title="Delete session"
                  className="absolute right-3 top-1/2 -translate-y-1/2
                             opacity-0 group-hover:opacity-100 transition-opacity
                             w-8 h-8 flex items-center justify-center rounded-lg
                             text-text-muted hover:text-red hover:bg-red-50"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="text-[15px] font-bold text-text-pri">Delete this session?</p>
            <p className="text-[13px] text-text-sec">This will permanently remove the session and its feedback. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-btn text-[13px] font-semibold border border-border text-text-sec hover:text-text-pri transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
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
