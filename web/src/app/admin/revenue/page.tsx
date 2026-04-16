"use client";

import { useEffect, useState } from "react";

interface RevenueData {
  plans: { tier: string; status: string; count: string }[];
  recentSubscribers: {
    id: string; email: string; firstName: string | null; lastName: string | null;
    subscriptionTier: string; subscriptionStatus: string | null;
    subscriptionEndsAt: string | null; createdAt: string;
  }[];
}

const PLAN_PRICES: Record<string, number> = {
  weekly: 299,
  monthly: 799,
  yearly: 4999,
};

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/v1/admin/revenue", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setData);
  }, [token]);

  if (!data) return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-[#1e293b] rounded-2xl animate-pulse" />)}
    </div>
  );

  const activeProCount = data.plans.filter((p) => p.tier === "pro" && p.status === "active")
    .reduce((sum, p) => sum + parseInt(p.count, 10), 0);

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <div className="text-2xl font-bold text-white mb-1">{activeProCount}</div>
          <div className="text-slate-400 text-sm">Active Pro Users</div>
        </div>
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <div className="text-2xl font-bold text-emerald-400 mb-1">
            ₹{(activeProCount * 799).toLocaleString()}
          </div>
          <div className="text-slate-400 text-sm">Est. Monthly Revenue</div>
          <div className="text-slate-500 text-xs mt-1">Based on monthly plan avg</div>
        </div>
        <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
          <div className="text-2xl font-bold text-white mb-1">
            {data.plans.filter((p) => p.status === "cancelled").reduce((s, p) => s + parseInt(p.count, 10), 0)}
          </div>
          <div className="text-slate-400 text-sm">Cancelled</div>
        </div>
      </div>

      {/* Plan breakdown */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
        <h3 className="text-white font-semibold mb-4">Plan Breakdown</h3>
        {data.plans.length === 0 ? (
          <p className="text-slate-500 text-sm">No paid subscribers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-white/5">
                <th className="text-left py-2 font-medium">Tier</th>
                <th className="text-left py-2 font-medium">Status</th>
                <th className="text-left py-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.plans.map((p, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  <td className="py-3 text-slate-300 capitalize">{p.tier}</td>
                  <td className="py-3 capitalize">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      p.status === "active" ? "bg-emerald-500/15 text-emerald-400" :
                      p.status === "cancelled" ? "bg-red-500/15 text-red-400" :
                      "bg-slate-500/15 text-slate-400"
                    }`}>{p.status?.replace("_", " ") ?? "—"}</span>
                  </td>
                  <td className="py-3 text-white font-semibold">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent subscribers */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-white font-semibold">Recent Pro Subscribers</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-white/5">
              <th className="text-left px-5 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Ends At</th>
              <th className="text-left px-4 py-3 font-medium">Subscribed</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSubscribers.map((u) => (
              <tr key={u.id} className="border-b border-white/5 last:border-0">
                <td className="px-5 py-3">
                  <div className="text-slate-200">{u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}</div>
                  <div className="text-slate-500 text-xs">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
                    u.subscriptionStatus === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"
                  }`}>{u.subscriptionStatus?.replace("_", " ") ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{u.subscriptionEndsAt ? new Date(u.subscriptionEndsAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {data.recentSubscribers.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No subscribers yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
