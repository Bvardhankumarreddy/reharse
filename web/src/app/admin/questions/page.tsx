"use client";

import { useEffect, useState, useCallback } from "react";

interface Question {
  id: string;
  question: string;
  type: string;
  difficulty: string;
  modelAnswer: string | null;
  tags: string[];
  companies: string[];
  roles: string[];
  avgScore: number;
  attemptCount: number;
  isActive: boolean;
  createdAt: string;
}

const TYPES = ["", "behavioral", "coding", "system-design", "hr", "case-study"];
const DIFFS = ["", "easy", "medium", "hard"];

const typeColor: Record<string, string> = {
  behavioral: "bg-violet-500/15 text-violet-400",
  coding: "bg-sky-500/15 text-sky-400",
  "system-design": "bg-amber-500/15 text-amber-400",
  hr: "bg-emerald-500/15 text-emerald-400",
  "case-study": "bg-pink-500/15 text-pink-400",
};
const diffColor: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-amber-500/15 text-amber-400",
  hard: "bg-red-500/15 text-red-400",
};

const emptyForm = {
  question: "", type: "behavioral", difficulty: "medium",
  modelAnswer: "", tags: "", companies: "", roles: "",
};

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [search, setSearch] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (type) params.set("type", type);
    if (difficulty) params.set("difficulty", difficulty);
    if (search) params.set("search", search);
    const res = await fetch(`/api/v1/admin/questions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setQuestions(json.data);
    setTotal(json.total);
    setPages(json.pages);
    setLoading(false);
  }, [token, page, type, difficulty, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, difficulty, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(q: Question) {
    setEditing(q);
    setForm({
      question: q.question,
      type: q.type,
      difficulty: q.difficulty,
      modelAnswer: q.modelAnswer ?? "",
      tags: q.tags.join(", "),
      companies: q.companies.join(", "),
      roles: q.roles.join(", "),
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!token || !form.question.trim()) return;
    setSaving(true);
    const body = {
      question: form.question,
      type: form.type,
      difficulty: form.difficulty,
      modelAnswer: form.modelAnswer || undefined,
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      companies: form.companies.split(",").map((s) => s.trim()).filter(Boolean),
      roles: form.roles.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const url = editing
      ? `/api/v1/admin/questions/${editing.id}`
      : "/api/v1/admin/questions";
    await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setShowModal(false);
    void load();
  }

  async function toggleActive(q: Question) {
    if (!token) return;
    await fetch(`/api/v1/admin/questions/${q.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !q.isActive }),
    });
    void load();
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions..."
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All types</option>
          {TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All difficulties</option>
          {DIFFS.filter(Boolean).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button
          onClick={openCreate}
          className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition"
        >
          + Add Question
        </button>
        <span className="text-slate-400 text-sm self-center">{total} questions</span>
      </div>

      {/* Table */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium w-1/2">Question</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Difficulty</th>
              <th className="text-left px-4 py-3 font-medium">Attempts</th>
              <th className="text-left px-4 py-3 font-medium">Avg Score</th>
              <th className="text-left px-4 py-3 font-medium">Active</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-4 bg-white/5 rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              : questions.map((q) => (
                  <tr key={q.id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-4">
                      <div className="text-slate-200 text-sm line-clamp-2">{q.question}</div>
                      {q.companies.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {q.companies.slice(0, 3).map((c) => (
                            <span key={c} className="text-[10px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${typeColor[q.type] ?? "bg-slate-500/15 text-slate-400"}`}>
                        {q.type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${diffColor[q.difficulty] ?? ""}`}>
                        {q.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300">{q.attemptCount}</td>
                    <td className="px-4 py-4 text-slate-300">{q.avgScore > 0 ? Math.round(q.avgScore) : "—"}</td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleActive(q)}
                        className={`w-8 h-5 rounded-full transition ${q.isActive ? "bg-emerald-500" : "bg-slate-600"}`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${q.isActive ? "translate-x-3.5" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => openEdit(q)}
                        className="text-indigo-400 hover:text-indigo-300 text-xs"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40">Prev</button>
          <span className="text-slate-400 text-sm">Page {page} of {pages}</span>
          <button disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40">Next</button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-white font-bold text-lg mb-4">{editing ? "Edit Question" : "Add Question"}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Question</label>
                <textarea
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  rows={3}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  >
                    {TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  >
                    {DIFFS.filter(Boolean).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Model Answer</label>
                <textarea
                  value={form.modelAnswer}
                  onChange={(e) => setForm({ ...form, modelAnswer: e.target.value })}
                  rows={4}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Optional ideal answer..."
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Tags (comma-separated)</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  placeholder="leadership, teamwork, conflict"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Companies (comma-separated)</label>
                <input
                  value={form.companies}
                  onChange={(e) => setForm({ ...form, companies: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  placeholder="Google, Amazon, Microsoft"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Roles (comma-separated)</label>
                <input
                  value={form.roles}
                  onChange={(e) => setForm({ ...form, roles: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  placeholder="SDE, PM, Designer"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.question.trim()}
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
