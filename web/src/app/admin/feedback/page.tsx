"use client";

import { useEffect, useState, useCallback } from "react";

interface FeedbackItem {
  id: string; userId: string; userEmail: string | null;
  rating: number | null; category: string | null; message: string; createdAt: string;
}

const CATEGORIES = ["", "bug", "feature", "general", "praise"];
const categoryColor: Record<string, string> = {
  bug: "bg-red-500/15 text-red-400",
  feature: "bg-blue-500/15 text-blue-400",
  praise: "bg-emerald-500/15 text-emerald-400",
  general: "bg-slate-500/15 text-slate-400",
};

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [category, setCategory] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (category) params.set("category", category);
    const res = await fetch(`/api/v1/admin/feedback?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setItems(json.data);
    setTotal(json.total);
    setPages(json.pages);
    setLoading(false);
  }, [token, page, category]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [category]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All categories</option>
          {CATEGORIES.filter(Boolean).map((c) => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>
        <span className="ml-auto text-slate-400 text-sm">{total} items</span>
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 bg-[#1e293b] rounded-2xl animate-pulse" />
            ))
          : items.map((f) => (
              <div key={f.id} className="bg-[#1e293b] rounded-2xl p-5 border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {f.category && (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${categoryColor[f.category] ?? "bg-slate-500/15 text-slate-400"}`}>
                          {f.category}
                        </span>
                      )}
                      {f.rating && <span className="text-amber-400 text-sm">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>}
                      <span className="text-slate-500 text-xs ml-auto">{new Date(f.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-200 text-sm leading-relaxed">{f.message}</p>
                    <div className="text-slate-500 text-xs mt-2">{f.userEmail ?? f.userId}</div>
                  </div>
                </div>
              </div>
            ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40">← Prev</button>
          <span className="text-slate-400 text-sm">Page {page} of {pages}</span>
          <button disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
