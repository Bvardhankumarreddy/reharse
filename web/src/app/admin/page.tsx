"use client";

import { useEffect, useState, useCallback } from "react";

interface CronStatus {
  paused: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

async function fetchCronStatus(token: string): Promise<CronStatus> {
  const res = await fetch("/api/v1/admin/system/cron-status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function setCronStatus(token: string, paused: boolean): Promise<CronStatus> {
  const res = await fetch("/api/v1/admin/system/cron-status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paused }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function CronControlCard({ token }: { token: string | null }) {
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStatus(await fetchCronStatus(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cron status");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function toggle() {
    if (!token || !status) return;
    const next = !status.paused;
    const verb = next ? "PAUSE" : "RESUME";
    if (!confirm(
      `${verb} all scheduled crons across the platform?\n\n` +
      `Manual actions (regen script, generate scenes, publish) are NOT affected — ` +
      `only scheduled repeaters idle out. Change takes effect within ~30 seconds.`
    )) return;
    setBusy(true);
    try {
      const next_status = await setCronStatus(token, next);
      setStatus(next_status);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update cron status");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5 animate-pulse h-24" />
    );
  }

  const paused = status.paused;
  const stampParts: string[] = [];
  if (status.updated_at) stampParts.push(new Date(status.updated_at).toLocaleString());
  if (status.updated_by) stampParts.push(`by ${status.updated_by}`);

  return (
    <div className={`rounded-2xl p-5 border ${
      paused
        ? "bg-amber-500/10 border-amber-500/40"
        : "bg-emerald-500/10 border-emerald-500/40"
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${
            paused ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
          }`}>
            <span className="material-symbols-outlined text-[22px]">
              {paused ? "pause_circle" : "play_circle"}
            </span>
          </span>
          <div>
            <div className="text-white font-semibold text-base">
              Scheduled crons: {paused ? "PAUSED" : "RUNNING"}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {paused
                ? "All repeating jobs (ingest, score, script-gen, metrics, postmortem, publish) are idle. Manual actions still work."
                : "Ingestion, scoring, script generation, metrics, learning loop, and social publishing fire on their normal schedules."}
              {stampParts.length > 0 && (
                <span className="text-slate-500 ml-1">· Last changed {stampParts.join(" ")}</span>
              )}
            </div>
            {error && (
              <div className="text-xs text-red-400 mt-1">{error}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => void toggle()}
          disabled={busy}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
            paused
              ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/30"
              : "bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {busy ? "…" : paused ? "▶ Resume all crons" : "⏸ Pause all crons"}
        </button>
      </div>
    </div>
  );
}

interface Stats {
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  totalSessions: number;
  completedSessions: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  activeStreaks: number;
  userFeedbackCount: number;
  avgSessionScore: number | null;
  subscriptionBreakdown: { tier: string; count: number }[];
}

async function fetchStats(token: string): Promise<Stats> {
  const res = await fetch("/api/v1/admin/stats", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string; icon: string; color: string;
}) {
  return (
    <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
      <div className="flex items-start justify-between mb-4">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/token");
        if (!res.ok) return;
        const { token: t } = (await res.json()) as { token?: string };
        if (!t) return;
        setToken(t);
        const s = await fetchStats(t);
        setStats(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load stats");
      }
    })();
  }, []);

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-red-400 text-sm bg-red-400/10 px-4 py-3 rounded-xl">{error}</div>
    </div>
  );

  if (!stats) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-[#1e293b] rounded-2xl p-5 border border-white/5 h-32 animate-pulse" />
      ))}
    </div>
  );

  const completionRate = stats.totalSessions
    ? Math.round((stats.completedSessions / stats.totalSessions) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Cron kill-switch — sits at top so operators see current state immediately */}
      <CronControlCard token={token} />

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.totalUsers.toLocaleString()} icon="group" color="bg-indigo-500/15 text-indigo-400" sub={`+${stats.newUsersToday} today`} />
        <StatCard label="Pro Subscribers" value={stats.proUsers.toLocaleString()} icon="workspace_premium" color="bg-amber-500/15 text-amber-400" sub={`${stats.freeUsers} free`} />
        <StatCard label="Total Sessions" value={stats.totalSessions.toLocaleString()} icon="mic" color="bg-emerald-500/15 text-emerald-400" sub={`${completionRate}% completion rate`} />
        <StatCard label="Avg Session Score" value={stats.avgSessionScore ? `${stats.avgSessionScore}/100` : "—"} icon="grade" color="bg-blue-500/15 text-blue-400" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="New This Week" value={stats.newUsersThisWeek} icon="trending_up" color="bg-violet-500/15 text-violet-400" />
        <StatCard label="Active Streaks" value={stats.activeStreaks} icon="local_fire_department" color="bg-orange-500/15 text-orange-400" />
        <StatCard label="Completed Sessions" value={stats.completedSessions.toLocaleString()} icon="check_circle" color="bg-teal-500/15 text-teal-400" />
        <StatCard label="User Feedback" value={stats.userFeedbackCount} icon="reviews" color="bg-pink-500/15 text-pink-400" />
      </div>

      {/* Subscription breakdown */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Subscription Breakdown</h2>
        <div className="flex gap-6">
          {stats.subscriptionBreakdown.map((item) => (
            <div key={item.tier} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.tier === "pro" ? "bg-amber-400" : "bg-slate-500"}`} />
              <span className="text-slate-300 text-sm capitalize">{item.tier}</span>
              <span className="text-white font-semibold">{item.count}</span>
              <span className="text-slate-500 text-xs">
                ({stats.totalUsers ? Math.round((item.count / stats.totalUsers) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
