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
  notes: {
    id: string; content: string; authorEmail: string; createdAt: string;
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
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [subOverride, setSubOverride] = useState({ tier: "", status: "", endsAt: "" });
  const [showSubModal, setShowSubModal] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

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

  async function addNote() {
    if (!token || !noteText.trim()) return;
    setSavingNote(true);
    const res = await fetch(`/api/v1/admin/users/${id}/notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteText }),
    });
    const note = await res.json();
    setData((d) => d ? { ...d, notes: [note, ...d.notes] } : d);
    setNoteText("");
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    if (!token) return;
    await fetch(`/api/v1/admin/notes/${noteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setData((d) => d ? { ...d, notes: d.notes.filter((n) => n.id !== noteId) } : d);
  }

  function openSubOverride() {
    if (!data) return;
    setSubOverride({
      tier: data.user.subscriptionTier,
      status: data.user.subscriptionStatus ?? "",
      endsAt: data.user.subscriptionEndsAt ? data.user.subscriptionEndsAt.slice(0, 10) : "",
    });
    setShowSubModal(true);
  }

  async function saveSubOverride() {
    if (!token || !data) return;
    setSavingSub(true);
    const body: Record<string, string> = {};
    if (subOverride.tier !== data.user.subscriptionTier) body.subscriptionTier = subOverride.tier;
    if (subOverride.status !== (data.user.subscriptionStatus ?? "")) body.subscriptionStatus = subOverride.status;
    if (subOverride.endsAt) body.subscriptionEndsAt = new Date(subOverride.endsAt).toISOString();

    const res = await fetch(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const updated = await res.json();
    setData((d) => d ? { ...d, user: updated } : d);
    setSavingSub(false);
    setShowSubModal(false);
  }

  if (!data) return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-32 bg-[#1e293b] rounded-2xl animate-pulse" />
      ))}
    </div>
  );

  const { user, sessions, sessionStats, feedbacks, notes } = data;

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
          <div className="flex gap-2">
            <button
              onClick={openSubOverride}
              className="px-4 py-2 rounded-xl text-sm font-medium transition border border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              Override Sub
            </button>
            <button
              onClick={toggleAdmin}
              disabled={saving}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
                user.isAdmin
                  ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                  : "border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
              } disabled:opacity-50`}
            >
              {saving ? "..." : user.isAdmin ? "Revoke Admin" : "Make Admin"}
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Sessions", value: sessionStats.total },
          { label: "Completed", value: sessionStats.completed },
          { label: "Avg Score", value: sessionStats.avgScore ? `${sessionStats.avgScore}/100` : "—" },
          { label: "Current Streak", value: user.currentStreak },
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

      {/* Admin Notes */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
        <h3 className="text-white font-semibold mb-4">Admin Notes</h3>
        <div className="flex gap-2 mb-4">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about this user..."
            className="flex-1 bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
          />
          <button
            onClick={addNote}
            disabled={savingNote || !noteText.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition disabled:opacity-50"
          >
            {savingNote ? "..." : "Add"}
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="text-slate-500 text-sm">No notes yet</p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="bg-white/3 rounded-xl px-4 py-3 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-slate-300 text-sm">{n.content}</p>
                  <div className="text-slate-500 text-xs mt-1">
                    {n.authorEmail} &middot; {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => deleteNote(n.id)}
                  className="text-slate-500 hover:text-red-400 text-xs transition shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
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
              <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 cursor-pointer" onClick={() => router.push(`/admin/sessions/${s.id}`)}>
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
                  {f.rating && <span className="text-amber-400 text-sm">{"*".repeat(f.rating)}{"*".repeat(5 - f.rating).replace(/\*/g, "")}</span>}
                  {f.category && <Badge label={f.category} color="bg-slate-500/10 text-slate-400 border-slate-500/20" />}
                  <span className="text-slate-500 text-xs ml-auto">{new Date(f.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-slate-300 text-sm">{f.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscription Override Modal */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 w-full max-w-md p-6">
            <h2 className="text-white font-bold text-lg mb-4">Override Subscription</h2>
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Tier</label>
                <select
                  value={subOverride.tier}
                  onChange={(e) => setSubOverride({ ...subOverride, tier: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Status</label>
                <select
                  value={subOverride.status}
                  onChange={(e) => setSubOverride({ ...subOverride, status: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                >
                  <option value="">None</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Ends At</label>
                <input
                  type="date"
                  value={subOverride.endsAt}
                  onChange={(e) => setSubOverride({ ...subOverride, endsAt: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSubModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition">Cancel</button>
              <button
                onClick={saveSubOverride}
                disabled={savingSub}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-xl transition disabled:opacity-50"
              >
                {savingSub ? "Saving..." : "Save Override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
