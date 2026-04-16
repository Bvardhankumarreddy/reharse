"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/token");
        if (!res.ok) return;
        const { token } = (await res.json()) as { token?: string };
        if (!token) return;
        const s = await fetchStats(token);
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
