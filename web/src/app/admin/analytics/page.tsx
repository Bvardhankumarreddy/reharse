"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

interface DAUEntry { date: string; activeUsers: number; newUsers: number; sessions: number; }
interface HeatmapEntry { dayOfWeek: number; hour: number; count: number; }
interface Funnel { totalSignups: number; onboarded: number; hadFirstSession: number; subscribed: number; }
interface CohortRow { cohortWeek: string; cohortSize: number; retention: number[]; }

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function useAdminToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);
  return token;
}

async function fetchAdmin<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`/api/v1/admin/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export default function AnalyticsPage() {
  const token = useAdminToken();
  const [dau, setDau] = useState<DAUEntry[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetchAdmin<DAUEntry[]>("analytics/dau-wau?days=30", token),
      fetchAdmin<HeatmapEntry[]>("analytics/heatmap", token),
      fetchAdmin<Funnel>("analytics/funnel", token),
      fetchAdmin<CohortRow[]>("analytics/retention?weeks=8", token),
    ]).then(([d, h, f, c]) => {
      setDau(d);
      setHeatmap(h);
      setFunnel(f);
      setCohorts(c);
      setLoading(false);
    });
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 bg-[#1e293b] rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  // Build heatmap grid
  const heatmapMax = Math.max(...heatmap.map((h) => h.count), 1);
  const heatmapGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  heatmap.forEach((h) => { heatmapGrid[h.dayOfWeek][h.hour] = h.count; });

  // Funnel bars
  const funnelSteps = funnel
    ? [
        { label: "Signups", value: funnel.totalSignups, color: "#6366f1" },
        { label: "Onboarded", value: funnel.onboarded, color: "#8b5cf6" },
        { label: "First Session", value: funnel.hadFirstSession, color: "#a78bfa" },
        { label: "Subscribed", value: funnel.subscribed, color: "#f59e0b" },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* DAU / WAU Chart */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Daily Active Users & Sessions (30 days)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dau}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={11}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis stroke="#64748b" fontSize={11} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Line type="monotone" dataKey="activeUsers" stroke="#6366f1" strokeWidth={2} dot={false} name="Active Users" />
            <Line type="monotone" dataKey="newUsers" stroke="#22c55e" strokeWidth={2} dot={false} name="New Users" />
            <Line type="monotone" dataKey="sessions" stroke="#f59e0b" strokeWidth={2} dot={false} name="Sessions" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Funnel + Heatmap row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <h2 className="text-white font-semibold mb-4">Conversion Funnel</h2>
          <div className="space-y-3">
            {funnelSteps.map((step, i) => {
              const pct = funnel!.totalSignups ? Math.round((step.value / funnel!.totalSignups) * 100) : 0;
              const dropoff = i > 0
                ? Math.round(((funnelSteps[i - 1].value - step.value) / Math.max(funnelSteps[i - 1].value, 1)) * 100)
                : 0;
              return (
                <div key={step.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">{step.label}</span>
                    <span className="text-white font-semibold">
                      {step.value.toLocaleString()}
                      <span className="text-slate-500 font-normal ml-1">({pct}%)</span>
                      {i > 0 && dropoff > 0 && (
                        <span className="text-red-400 text-xs ml-2">-{dropoff}%</span>
                      )}
                    </span>
                  </div>
                  <div className="h-8 bg-white/5 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all"
                      style={{ width: `${pct}%`, backgroundColor: step.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Session Heatmap */}
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <h2 className="text-white font-semibold mb-4">Session Activity Heatmap</h2>
          <div className="overflow-x-auto">
            <div className="flex gap-0.5">
              <div className="flex flex-col gap-0.5 mr-1 pt-5">
                {DAYS.map((d) => (
                  <div key={d} className="h-5 flex items-center text-[10px] text-slate-500">{d}</div>
                ))}
              </div>
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="flex flex-col gap-0.5">
                  <div className="text-[9px] text-slate-500 text-center h-4">{h}</div>
                  {Array.from({ length: 7 }).map((_, d) => {
                    const val = heatmapGrid[d][h];
                    const intensity = val / heatmapMax;
                    return (
                      <div
                        key={d}
                        className="w-5 h-5 rounded-sm"
                        style={{
                          backgroundColor: val === 0
                            ? "rgba(255,255,255,0.03)"
                            : `rgba(99, 102, 241, ${0.15 + intensity * 0.85})`,
                        }}
                        title={`${DAYS[d]} ${h}:00 — ${val} sessions`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-500">
            <span>Less</span>
            {[0.1, 0.3, 0.5, 0.7, 1].map((o) => (
              <div key={o} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(99,102,241,${o})` }} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>

      {/* Cohort Retention */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5 overflow-x-auto">
        <h2 className="text-white font-semibold mb-4">Weekly Cohort Retention</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 uppercase tracking-wide">
              <th className="text-left py-2 px-2 font-medium">Cohort</th>
              <th className="text-left py-2 px-2 font-medium">Size</th>
              {Array.from({ length: 8 }).map((_, i) => (
                <th key={i} className="text-center py-2 px-2 font-medium">W{i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.cohortWeek} className="border-t border-white/5">
                <td className="py-2 px-2 text-slate-300">{c.cohortWeek}</td>
                <td className="py-2 px-2 text-slate-400">{c.cohortSize}</td>
                {Array.from({ length: 8 }).map((_, i) => {
                  const val = c.retention[i];
                  if (val === undefined) return <td key={i} className="py-2 px-2" />;
                  const bg = val >= 50 ? "bg-emerald-500/20 text-emerald-400"
                    : val >= 25 ? "bg-amber-500/20 text-amber-400"
                    : val > 0 ? "bg-red-500/20 text-red-400"
                    : "text-slate-600";
                  return (
                    <td key={i} className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded ${bg}`}>{val}%</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
