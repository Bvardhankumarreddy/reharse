"use client";

import { useEffect, useState, useCallback } from "react";

interface CronRow {
  key:        string;
  label:      string;
  module:     string;
  schedule:   string;
  paused:     boolean;
  updated_at: string | null;
  updated_by: string | null;
}

async function fetchCrons(token: string): Promise<CronRow[]> {
  const res = await fetch("/api/v1/admin/system/crons", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function setCronPaused(
  token: string, key: string, paused: boolean,
): Promise<CronRow[]> {
  const res = await fetch(
    `/api/v1/admin/system/crons/${encodeURIComponent(key)}/pause`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paused }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function CronControlCard({ token }: { token: string | null }) {
  const [rows, setRows] = useState<CronRow[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(await fetchCrons(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load crons");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function toggleOne(row: CronRow) {
    if (!token) return;
    const next = !row.paused;
    setBusyKey(row.key);
    try {
      const updated = await setCronPaused(token, row.key, next);
      setRows(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to update ${row.key}`);
    } finally {
      setBusyKey(null);
    }
  }

  if (!rows) {
    return (
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5 animate-pulse h-40" />
    );
  }

  const pausedCount = rows.filter((r) => r.paused).length;
  const groups = rows.reduce<Record<string, CronRow[]>>((acc, r) => {
    (acc[r.module] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-white/5">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/15 text-indigo-400">
            <span className="material-symbols-outlined text-[20px]">schedule</span>
          </span>
          <div>
            <div className="text-white font-semibold text-base">Scheduled crons</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {pausedCount === 0
                ? `All ${rows.length} crons running on schedule. Manual actions unaffected.`
                : `${pausedCount} of ${rows.length} crons paused. The rest fire on their normal schedules.`}
            </div>
          </div>
        </div>
        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg">{error}</div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {Object.entries(groups).map(([module, list]) => (
          <div key={module}>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2 px-1">
              {module}
            </div>
            <div className="space-y-1.5">
              {list.map((row) => {
                const stampParts: string[] = [];
                if (row.updated_at) stampParts.push(new Date(row.updated_at).toLocaleString());
                if (row.updated_by) stampParts.push(`by ${row.updated_by}`);
                const busy = busyKey === row.key;
                return (
                  <div
                    key={row.key}
                    className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 border ${
                      row.paused
                        ? "bg-amber-500/5 border-amber-500/25"
                        : "bg-white/[0.02] border-white/5"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {row.label}
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          row.paused
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-emerald-500/15 text-emerald-400"
                        }`}>
                          {row.paused ? "PAUSED" : "RUNNING"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        <code className="text-slate-400">{row.key}</code>
                        <span className="text-slate-600"> · {row.schedule}</span>
                        {stampParts.length > 0 && (
                          <span className="text-slate-600"> · {stampParts.join(" ")}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => void toggleOne(row)}
                      disabled={busy}
                      className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                        row.paused
                          ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                          : "bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {busy ? "…" : row.paused ? "▶ Resume" : "⏸ Pause"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
