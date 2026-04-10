"use client";

// Spec § Screen 6: Progress Dashboard — wired to real session/user data

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { SessionResponse, UserResponse } from "@/lib/api/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  behavioral:    "#7C3AED",
  coding:        "#0EA5E9",
  "system-design": "#F59E0B",
  hr:            "#22C55E",
  "case-study":  "#EF4444",
};

const TYPE_LABELS: Record<string, string> = {
  behavioral:    "Behavioral",
  coding:        "Coding",
  "system-design": "System Design",
  hr:            "HR",
  "case-study":  "Case Study",
};

function fmt(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
}

// ── Derived stats from sessions ───────────────────────────────────────────────

function deriveStats(sessions: SessionResponse[], user: UserResponse | null) {
  const completed = sessions.filter((s) => s.status === "completed" && s.overallScore !== null);

  // Score trend — last 30 sessions with scores, sorted by completedAt
  const scoreTrend = completed
    .filter((s) => s.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime())
    .slice(-30)
    .map((s) => ({ date: fmt(s.completedAt!), score: s.overallScore! }));

  // Overall score — average of last 5 scored sessions
  const recent5 = completed.slice(-5);
  const overallScore = recent5.length
    ? Math.round(recent5.reduce((sum, s) => sum + s.overallScore!, 0) / recent5.length)
    : null;

  // First score (for delta)
  const firstScore = completed.length >= 2 ? completed[0].overallScore! : null;
  const scoreDelta = overallScore !== null && firstScore !== null ? overallScore - firstScore : null;

  // Topic breakdown — group by interviewType
  const byType: Record<string, number[]> = {};
  completed.forEach((s) => {
    if (!byType[s.interviewType]) byType[s.interviewType] = [];
    byType[s.interviewType].push(s.overallScore!);
  });
  const topicMastery = Object.entries(byType).map(([type, scores]) => ({
    type,
    label:    TYPE_LABELS[type] ?? type,
    color:    TYPE_COLORS[type] ?? "#94A3B8",
    sessions: scores.length,
    pct:      Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));

  // Best category
  const bestTopic = topicMastery.length
    ? topicMastery.reduce((best, t) => (t.pct > best.pct ? t : best))
    : null;

  // Activity heatmap — last 91 days
  const today   = new Date();
  const dayMap: Record<string, number> = {};
  sessions.forEach((s) => {
    const d = new Date(s.createdAt);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] ?? 0) + 1;
  });
  const heatCells = Array.from({ length: 91 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (90 - i));
    const key = d.toISOString().slice(0, 10);
    const count = dayMap[key] ?? 0;
    const val = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
    return { i, val };
  });

  // Badges — derived from real data
  const streak = user?.currentStreak ?? 0;
  const badges = [
    { icon: "🔥", label: "7-Day Streak",        earned: streak >= 7   },
    { icon: "🎯", label: "First Behavioral Ace", earned: completed.some((s) => s.interviewType === "behavioral" && (s.overallScore ?? 0) >= 80) },
    { icon: "💻", label: "Code Warrior",         earned: completed.some((s) => s.interviewType === "coding") },
    { icon: "⭐", label: "System Thinker",        earned: completed.some((s) => s.interviewType === "system-design" && (s.overallScore ?? 0) >= 70) },
    { icon: "🏆", label: "Interview Ready",       earned: (overallScore ?? 0) >= 80 },
    { icon: "🎓", label: "Full Loop",             earned: new Set(completed.map((s) => s.interviewType)).size >= 4 },
  ];

  // AI Insight — surface weakest topic
  const weakTopics = [...topicMastery].sort((a, b) => a.pct - b.pct).slice(0, 2);

  return {
    scoreTrend, overallScore, scoreDelta,
    totalCompleted: completed.length,
    bestTopic, topicMastery,
    heatCells, badges, weakTopics,
    streak,
  };
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function Heatmap({ cells }: { cells: { i: number; val: number }[] }) {
  const bg = ["bg-[#E2E6ED]", "bg-blue-200", "bg-blue-400", "bg-blue-600"];
  return (
    <div className="bg-surface border border-border rounded-card p-6 shadow-card">
      <h3 className="text-heading-m text-text-pri mb-4">Practice Consistency</h3>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, 1fr)" }}>
        {cells.map(({ i, val }) => (
          <div key={i} className={`h-4 rounded-sm ${bg[val]}`} />
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-3">
        <span className="text-small text-text-muted">Less</span>
        {bg.map((c, i) => <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />)}
        <span className="text-small text-text-muted">More</span>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-border rounded ${className ?? ""}`} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const { api, ready } = useApiClient();
  const [sessions, setSessions] = useState<SessionResponse[] | null>(null);
  const [user,     setUser]     = useState<UserResponse | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    Promise.all([api.getSessions(), api.getMe()])
      .then(([s, u]) => { setSessions(s); setUser(u); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load data"));
  }, [api, ready]);

  const stats = useMemo(
    () => (sessions ? deriveStats(sessions, user) : null),
    [sessions, user],
  );

  const loading = sessions === null && !error;

  // ── Stat cards ──────────────────────────────────────────────────────────

  const statCards = stats
    ? [
        {
          label: "Overall Score",
          value: stats.overallScore !== null ? String(stats.overallScore) : "—",
          sub:   stats.scoreDelta !== null
            ? `${stats.scoreDelta >= 0 ? "↑" : "↓"}${Math.abs(stats.scoreDelta)} from first`
            : "no data yet",
          color: "text-blue",
        },
        {
          label: "Sessions Completed",
          value: String(stats.totalCompleted),
          sub:   "all time",
          color: "text-violet",
        },
        {
          label: "Best Category",
          value: stats.bestTopic ? stats.bestTopic.label : "—",
          sub:   stats.bestTopic ? `${stats.bestTopic.pct} avg score` : "no sessions yet",
          color: "text-green",
        },
        {
          label: "Current Streak",
          value: `${stats.streak}${stats.streak > 0 ? " 🔥" : ""}`,
          sub:   "days",
          color: "text-amber",
        },
      ]
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-heading-l text-text-pri">My Progress</h2>
        {loading ? (
          <Skeleton className="h-4 w-56 mt-2" />
        ) : stats ? (
          <p className="text-body text-text-sec mt-1">
            {stats.totalCompleted} sessions completed
            {stats.scoreDelta !== null && stats.scoreDelta > 0 && ` · +${stats.scoreDelta} points overall`}
          </p>
        ) : null}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {/* ── New-user empty state ─────────────────────────────────────────────── */}
      {!loading && !error && stats && stats.totalCompleted === 0 && (
        <div className="bg-surface border border-border rounded-card p-8 sm:p-12 shadow-card text-center space-y-5">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-[40px] text-[#7C3AED]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>
              insert_chart
            </span>
          </div>
          <div>
            <p className="text-[18px] font-black text-text-pri">Nothing to show yet</p>
            <p className="text-text-sec text-[14px] mt-2 leading-relaxed max-w-md mx-auto">
              Your score trend, topic breakdown, heatmap, and badges will all appear here after your first session. It takes less than 30 minutes.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center pt-1">
            {[
              { label: "Behavioral",    href: "/interview/setup?type=behavioral",    icon: "forum" },
              { label: "Coding",        href: "/interview/setup?type=coding",        icon: "code" },
              { label: "System Design", href: "/interview/setup?type=system-design", icon: "architecture" },
            ].map((t) => (
              <Link key={t.label} href={t.href}
                className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-btn text-[13px] font-semibold text-text-sec hover:border-blue/40 hover:text-blue transition-colors">
                <span className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </div>
          <Link href="/interview/setup"
            className="inline-flex items-center gap-2 btn-gradient text-white px-8 py-3 rounded-btn font-bold text-[14px] shadow-blue-glow hover:-translate-y-0.5 transition-all">
            <span className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>play_circle</span>
            Start my first interview
          </Link>
        </div>
      )}

      {/* Stat cards + charts — only rendered when there is real data or loading */}
      {(loading || !stats || stats.totalCompleted > 0) && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-surface border border-border rounded-card p-5 shadow-card space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))
              : (statCards ?? []).map((s) => (
                  <div key={s.label} className="bg-surface border border-border rounded-card p-4 sm:p-5 shadow-card">
                    <p className="label text-text-muted text-[10px]">{s.label}</p>
                    <p className={`text-[22px] sm:text-[28px] font-black tracking-tight mt-1 ${s.color}`}>{s.value}</p>
                    <p className="text-small text-text-sec mt-0.5">{s.sub}</p>
                  </div>
                ))}
          </div>

          {/* Score Trend */}
          <div className="bg-surface border border-border rounded-card p-6 shadow-card">
            <h3 className="text-heading-m text-text-pri mb-6">Readiness Score — Last 30 Sessions</h3>
            {loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : stats && stats.scoreTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={stats.scoreTrend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #E2E6ED", borderRadius: 8, fontSize: 13 }}
                    formatter={(v: number) => [`${v}`, "Score"]}
                  />
                  <Line
                    type="monotone" dataKey="score"
                    stroke="#3B82F6" strokeWidth={2.5}
                    dot={{ fill: "#3B82F6", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-text-muted text-sm">
                Complete interviews to see your score trend
              </div>
            )}
          </div>

          {/* Activity Heatmap */}
          {loading ? (
            <div className="bg-surface border border-border rounded-card p-6 shadow-card">
              <Skeleton className="h-5 w-40 mb-4" />
              <Skeleton className="h-[68px] w-full" />
            </div>
          ) : stats ? (
            <Heatmap cells={stats.heatCells} />
          ) : null}

          {/* Topic Breakdown */}
          <div className="bg-surface border border-border rounded-card p-6 shadow-card">
            <h3 className="text-heading-m text-text-pri mb-6">Topic Breakdown</h3>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : stats && stats.topicMastery.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.topicMastery.map((t) => (
                  <div key={t.type} className="p-4 bg-bg-app rounded-xl space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-text-pri leading-snug">{t.label}</p>
                      <span className="label px-2 py-0.5 rounded-full text-white flex-shrink-0"
                        style={{ fontSize: 9, backgroundColor: t.color }}>
                        {t.sessions} sessions
                      </span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${t.pct}%`, backgroundColor: t.pct < 50 ? "#EF4444" : t.color }} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-small text-text-muted">avg score</span>
                      <span className="font-mono text-[12px] font-bold"
                        style={{ color: t.pct < 50 ? "#EF4444" : t.color }}>
                        {t.pct}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-muted text-sm">Complete interviews to see topic breakdown</p>
            )}
          </div>

          {/* Badges */}
          <div className="bg-surface border border-border rounded-card p-6 shadow-card">
            <h3 className="text-heading-m text-text-pri mb-4">Achievements</h3>
            {loading ? (
              <div className="flex flex-wrap gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="w-24 h-24 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-3 sm:gap-4">
                {(stats?.badges ?? []).map((b) => (
                  <div key={b.label}
                    className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border transition-all ${
                      b.earned ? "border-blue/30 bg-blue-50" : "border-border bg-bg-app opacity-50"
                    }`}>
                    <span className="text-2xl sm:text-3xl">{b.icon}</span>
                    <span className="label text-text-pri text-center leading-tight" style={{ fontSize: 10, maxWidth: 72 }}>
                      {b.label}
                    </span>
                    {!b.earned && (
                      <span className="label text-text-muted" style={{ fontSize: 9 }}>Locked</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Insight */}
          {stats && stats.weakTopics.length > 0 && (
            <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl px-5 py-4">
              <span className="material-symbols-outlined text-[#7C3AED] text-[22px] mt-0.5 flex-shrink-0"
                style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
                auto_awesome
              </span>
              <p className="text-body text-text-pri leading-relaxed">
                <span className="font-semibold text-[#7C3AED]">AI Insight: </span>
                {stats.weakTopics.length === 1 ? (
                  <>Focus on <strong>{stats.weakTopics[0].label} ({stats.weakTopics[0].pct}%)</strong> to boost your overall readiness.</>
                ) : (
                  <>Focus on{" "}
                    <strong>{stats.weakTopics[0].label} ({stats.weakTopics[0].pct}%)</strong> and{" "}
                    <strong>{stats.weakTopics[1].label} ({stats.weakTopics[1].pct}%)</strong> this week to boost your overall readiness.
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
