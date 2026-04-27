"use client";

import { useEffect, useState, useCallback } from "react";

interface QuizConfig {
  id: string;
  quizWeek: number;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  quizWeek: 1,
  title: "Weekly AI Quiz",
  description: "",
  startsAt: "",
  endsAt: "",
  durationMinutes: 5,
  isActive: true,
};

function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleString()} → ${e.toLocaleString()}`;
}

function statusOf(c: QuizConfig): { label: string; color: string } {
  const now = new Date();
  const s = new Date(c.startsAt);
  const e = new Date(c.endsAt);
  if (!c.isActive) return { label: "Disabled", color: "bg-slate-500/20 text-slate-400" };
  if (now < s) return { label: "Upcoming", color: "bg-blue-500/20 text-blue-400" };
  if (now > e) return { label: "Closed", color: "bg-slate-500/20 text-slate-400" };
  return { label: "Live", color: "bg-emerald-500/20 text-emerald-400" };
}

export default function AdminQuizConfigPage() {
  const [data, setData] = useState<QuizConfig[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<QuizConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/v1/admin/quiz/config", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setData(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }

  function openEdit(c: QuizConfig) {
    setEditing(c);
    setForm({
      quizWeek: c.quizWeek,
      title: c.title,
      description: c.description,
      startsAt: new Date(c.startsAt).toISOString().slice(0, 16),
      endsAt: new Date(c.endsAt).toISOString().slice(0, 16),
      durationMinutes: c.durationMinutes,
      isActive: c.isActive,
    });
    setError(null);
    setShowModal(true);
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/quiz/config", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Save failed");
      setShowModal(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!token) return;
    if (!confirm("Delete this quiz config? This won't delete questions or submissions.")) return;
    await fetch(`/api/v1/admin/quiz/config/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    void load();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-xl mb-1">Quiz Schedule</h2>
          <p className="text-slate-400 text-sm">Set when each week&apos;s quiz opens, closes, and how long users have to complete it.</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition"
        >
          + Add Schedule
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-[#1e293b] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-12 text-center">
          <p className="text-slate-400 text-sm">No quiz schedules yet. Create one to enable the public quiz.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((c) => {
            const status = statusOf(c);
            return (
              <div key={c.id} className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Week {c.quizWeek}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                    </div>
                    <h3 className="text-white font-semibold text-lg">{c.title}</h3>
                    {c.description && <p className="text-slate-400 text-sm mt-1">{c.description}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                      <div>
                        <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Window</div>
                        <div className="text-slate-300 text-xs">{formatRange(c.startsAt, c.endsAt)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Session Timer</div>
                        <div className="text-slate-300">{c.durationMinutes} min</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(c)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 hover:text-indigo-200 text-xs font-medium transition border border-indigo-500/20"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 hover:text-red-200 text-xs font-medium transition border border-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-white font-bold text-lg mb-4">
              {editing ? `Edit Week ${editing.quizWeek} Schedule` : "Add Quiz Schedule"}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Quiz Week</label>
                  <input
                    type="number"
                    min={1}
                    value={form.quizWeek}
                    onChange={(e) => setForm({ ...form, quizWeek: parseInt(e.target.value, 10) || 1 })}
                    disabled={!!editing}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Session Timer (min)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: parseInt(e.target.value, 10) || 5 })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Starts At (Local)</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Ends At (Local)</label>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white [color-scheme:dark]"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span className="text-sm text-slate-300">Active (uncheck to disable this quiz)</span>
              </label>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.startsAt || !form.endsAt}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition disabled:opacity-50"
              >
                {saving ? "Saving..." : editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
