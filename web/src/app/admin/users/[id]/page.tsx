"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface UserDetail {
  user: {
    id: string; email: string; firstName: string | null; lastName: string | null;
    imageUrl: string | null; subscriptionTier: string; subscriptionStatus: string | null;
    subscriptionEndsAt: string | null; razorpaySubscriptionId: string | null;
    currentStreak: number; longestStreak: number; lastActiveDate: string | null;
    onboardingCompleted: boolean; isAdmin: boolean; targetRole: string | null;
    targetCompany: string | null; experienceLevel: string | null; goalType: string | null;
    createdAt: string; updatedAt: string;
  };
  sessions: {
    id: string; interviewType: string; status: string; overallScore: number | null;
    targetRole: string | null; targetCompany: string | null; durationMinutes: number;
    completedAt: string | null; createdAt: string;
  }[];
  sessionStats: {
    total: number; completed: number; avgScore: number | null; byType: Record<string, number>;
  };
  feedbacks: {
    id: string; userId: string; rating: number | null; category: string | null;
    message: string; createdAt: string;
  }[];
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${color}`}>{label}</span>;
}

function tierColor(t: string) {
  return t === "pro" ? "bg-amber-500/15 text-amber-400 border-amber-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20";
}

function statusColor(s: string | null) {
  if (s === "active") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (s === "past_due") return "bg-red-500/15 text-red-400 border-red-500/20";
  if (s === "cancelled") return "bg-slate-500/15 text-slate-400 border-slate-500/20";
  return "bg-slate-500/10 text-slate-500 border-slate-500/20";
}

function sessionStatusColor(s: string) {
  if (s === "completed") return "text-emerald-400";
  if (s === "abandoned") return "text-red-400";
  if (s === "active") return "text-blue-400";
  return "text-slate-400";
}

export default function UserDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<UserDetail | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setData);
  }, [id, token]);

  async function toggleAdmin() {
    if (!token || !data) return;
    setSaving(true);
    const res = await fetch(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: !data.user.isAdmin }),
    });
    const updated = await res.json();
    setData((d) => d ? { ...d, user: updated } : d);
    setSaving(false);
  }

  if (!data) return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-32 bg-[#1e293b] rounded-2xl animate-pulse" />
      ))}
    </div>
  );

  const { user, sessions, sessionStats, feedbacks } = data;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to users
      </button>

      {/* User header */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
        <div className="flex items-start gap-4">
          {user.imageUrl ? (
            <img src={user.imageUrl} className="w-14 h-14 rounded-2xl object-cover" alt="" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-xl font-bold">
              {(user.firstName?.[0] ?? user.email[0]).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-white font-bold text-lg">
                {user.firstName || user.lastName ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : user.email}
              </h2>
              <Badge label={user.subscriptionTier} color={tierColor(user.subscriptionTier)} />
              {user.subscriptionStatus && <Badge label={user.subscriptionStatus.replace("_", " ")} color={statusColor(user.subscriptionStatus)} />}
              {user.isAdmin && <Badge label="Admin" color="bg-red-500/15 text-red-400 border-red-500/20" />}
            </div>
            <div className="text-slate-400 text-sm mt-0.5">{user.email}</div>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-400">
              <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
              {user.lastActiveDate && <span>Last active {new Date(user.lastActiveDate).toLocaleDateString()}</span>}
              {user.targetRole && <span>Target: {user.targetRole}</span>}
              {user.experienceLevel && <span>{user.experienceLevel}</span>}
            </div>
          </div>
          <button
            onClick={toggleAdmin}
            disabled={saving}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
              user.isAdmin
                ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                : "border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
            } disabled:opacity-50`}
          >
            {saving ? "…" : user.isAdmin ? "Revoke Admin" : "Make Admin"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Sessions", value: sessionStats.total, icon: "mic" },
          { label: "Completed", value: sessionStats.completed, icon: "check_circle" },
          { label: "Avg Score", value: sessionStats.avgScore ? `${sessionStats.avgScore}/100` : "—", icon: "grade" },
          { label: "Current Streak", value: `🔥 ${user.currentStreak}`, icon: "local_fire_department" },
        ].map((s) => (
          <div key={s.label} className="bg-[#1e293b] rounded-2xl p-4 border border-white/5">
            <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
            <div className="text-slate-400 text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Subscription */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
        <h3 className="text-white font-semibold mb-4">Subscription</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div><div className="text-slate-500 mb-1">Plan</div><div className="text-white capitalize">{user.subscriptionTier}</div></div>
          <div><div className="text-slate-500 mb-1">Status</div><div className="text-white capitalize">{user.subscriptionStatus?.replace("_", " ") ?? "—"}</div></div>
          <div><div className="text-slate-500 mb-1">Ends At</div><div className="text-white">{user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toLocaleDateString() : "—"}</div></div>
          <div><div className="text-slate-500 mb-1">Razorpay ID</div><div className="text-white font-mono text-xs truncate">{user.razorpaySubscriptionId ?? "—"}</div></div>
        </div>
      </div>

      {/* Sessions table */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-white font-semibold">Sessions ({sessionStats.total})</h3>
          <div className="flex gap-2 text-xs">
            {Object.entries(sessionStats.byType).map(([type, count]) => (
              <span key={type} className="bg-white/5 text-slate-400 px-2 py-1 rounded-lg capitalize">
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-white/5 last:border-0">
                <td className="px-5 py-3 text-slate-300 capitalize">{s.interviewType}</td>
                <td className="px-4 py-3">
                  <span className={`capitalize font-medium ${sessionStatusColor(s.status)}`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-300">{s.overallScore != null ? `${s.overallScore}/100` : "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{s.targetRole ?? "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No sessions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* User feedback */}
      {feedbacks.length > 0 && (
        <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-white font-semibold">Submitted Feedback ({feedbacks.length})</h3>
          </div>
          <div className="divide-y divide-white/5">
            {feedbacks.map((f) => (
              <div key={f.id} className="px-5 py-4">
                <div className="flex items-center gap-3 mb-2">
                  {f.rating && <span className="text-amber-400 text-sm">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>}
                  {f.category && <Badge label={f.category} color="bg-slate-500/10 text-slate-400 border-slate-500/20" />}
                  <span className="text-slate-500 text-xs ml-auto">{new Date(f.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-slate-300 text-sm">{f.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
