"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Question {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  points: number;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  quizWeek: number;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  questionText: "", optionA: "", optionB: "", optionC: "", optionD: "",
  correctAnswer: "A" as "A" | "B" | "C" | "D",
  points: 1, difficulty: "easy" as "easy" | "medium" | "hard",
  category: "", quizWeek: 1,
};

const diffColor: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-amber-500/15 text-amber-400",
  hard: "bg-red-500/15 text-red-400",
};

export default function AdminQuizQuestionsPage() {
  const [data, setData] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [quizWeek, setQuizWeek] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modal
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
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (quizWeek) params.set("quizWeek", quizWeek);
    if (difficulty) params.set("difficulty", difficulty);
    if (search) params.set("search", search);
    if (active) params.set("active", active);
    const res = await fetch(`/api/v1/admin/quiz/questions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setData(json.data);
    setTotal(json.total);
    setPages(json.pages);
    setLoading(false);
  }, [token, page, quizWeek, difficulty, search, active]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [quizWeek, difficulty, search, active]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, quizWeek: quizWeek ? parseInt(quizWeek, 10) : 1 });
    setShowModal(true);
  }

  function openEdit(q: Question) {
    setEditing(q);
    setForm({
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctAnswer: q.correctAnswer,
      points: q.points,
      difficulty: q.difficulty,
      category: q.category,
      quizWeek: q.quizWeek,
    });
    setShowModal(true);
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const url = editing
        ? `/api/v1/admin/quiz/questions/${editing.id}`
        : "/api/v1/admin/quiz/questions";
      await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: form.questionText,
          option_a: form.optionA,
          option_b: form.optionB,
          option_c: form.optionC,
          option_d: form.optionD,
          correct_answer: form.correctAnswer,
          points: form.points,
          difficulty: form.difficulty,
          category: form.category,
          quiz_week: form.quizWeek,
          questionText: form.questionText,
          optionA: form.optionA,
          optionB: form.optionB,
          optionC: form.optionC,
          optionD: form.optionD,
          correctAnswer: form.correctAnswer,
          quizWeek: form.quizWeek,
        }),
      });
      setShowModal(false);
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteOne(id: string) {
    if (!token) return;
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/v1/admin/quiz/questions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    void load();
  }

  async function toggleActive(q: Question) {
    if (!token) return;
    await fetch(`/api/v1/admin/quiz/questions/${q.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !q.isActive }),
    });
    void load();
  }

  async function bulkAction(action: "activate" | "deactivate" | "delete") {
    if (!token || selected.size === 0) return;
    if (action === "delete" && !confirm(`Delete ${selected.size} questions?`)) return;
    await fetch("/api/v1/admin/quiz/questions/bulk", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    setSelected(new Set());
    void load();
  }

  async function exportCSV() {
    if (!token) return;
    const params = new URLSearchParams();
    if (quizWeek) params.set("quizWeek", quizWeek);
    if (difficulty) params.set("difficulty", difficulty);
    const res = await fetch(`/api/v1/admin/quiz/questions/export?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rehearse_questions_${quizWeek || "all"}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions..."
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
        />
        <input
          value={quizWeek}
          onChange={(e) => setQuizWeek(e.target.value)}
          placeholder="Week"
          type="number"
          className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none w-24"
        />
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select
          value={active}
          onChange={(e) => setActive(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All status</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition"
        >
          + Add Question
        </button>
        <Link
          href="/admin/quiz/import"
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition border border-white/10"
        >
          Import CSV
        </Link>
        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition border border-white/10"
        >
          Export CSV
        </button>
        <span className="ml-auto text-slate-400 text-sm self-center">{total} questions</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-2.5 flex gap-3 items-center">
          <span className="text-indigo-300 text-sm font-medium">{selected.size} selected</span>
          <button onClick={() => bulkAction("activate")} className="text-xs text-emerald-400 hover:text-emerald-300">Activate</button>
          <button onClick={() => bulkAction("deactivate")} className="text-xs text-amber-400 hover:text-amber-300">Deactivate</button>
          <button onClick={() => bulkAction("delete")} className="text-xs text-red-400 hover:text-red-300">Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-white">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={data.length > 0 && data.every((q) => selected.has(q.id))}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(data.map((q) => q.id)));
                    else setSelected(new Set());
                  }}
                />
              </th>
              <th className="text-left px-2 py-3 font-medium">Question</th>
              <th className="text-left px-3 py-3 font-medium">Diff</th>
              <th className="text-left px-3 py-3 font-medium">Pts</th>
              <th className="text-left px-3 py-3 font-medium">Wk</th>
              <th className="text-left px-3 py-3 font-medium">Active</th>
              <th className="text-left px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-4"><div className="h-4 bg-white/5 rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              : data.map((q) => (
                  <tr key={q.id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="text-white text-sm line-clamp-2 max-w-md">{q.questionText}</div>
                      <div className="text-slate-500 text-[10px] mt-0.5">{q.category} · ✓ {q.correctAnswer}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${diffColor[q.difficulty]}`}>
                        {q.difficulty}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{q.points}</td>
                    <td className="px-3 py-3 text-slate-300">W{q.quizWeek}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => toggleActive(q)}
                        className={`w-8 h-5 rounded-full transition ${q.isActive ? "bg-emerald-500" : "bg-slate-600"}`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${q.isActive ? "translate-x-3.5" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => openEdit(q)} className="text-indigo-400 hover:text-indigo-300 text-xs">Edit</button>
                        <button onClick={() => deleteOne(q.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                      </div>
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
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Question</label>
                <textarea
                  value={form.questionText}
                  onChange={(e) => setForm({ ...form, questionText: e.target.value })}
                  rows={2}
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                />
              </div>
              {(["A", "B", "C", "D"] as const).map((letter) => (
                <div key={letter}>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Option {letter}</label>
                  <input
                    value={form[`option${letter}` as keyof typeof form] as string}
                    onChange={(e) => setForm({ ...form, [`option${letter}`]: e.target.value })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Correct</label>
                  <select
                    value={form.correctAnswer}
                    onChange={(e) => setForm({ ...form, correctAnswer: e.target.value as "A" | "B" | "C" | "D" })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  >
                    {(["A", "B", "C", "D"] as const).map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Points</label>
                  <select
                    value={form.points}
                    onChange={(e) => setForm({ ...form, points: parseInt(e.target.value, 10) })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  >
                    {[1, 2, 3].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value as "easy" | "medium" | "hard" })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  >
                    {(["easy", "medium", "hard"] as const).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Quiz Week</label>
                  <input
                    type="number"
                    min={1}
                    value={form.quizWeek}
                    onChange={(e) => setForm({ ...form, quizWeek: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide block mb-1">Category</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g., Lesson 1 — AI vs ML vs DL"
                  className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition">Cancel</button>
              <button
                onClick={save}
                disabled={saving}
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
