"use client";

import { useCallback, useEffect, useState } from "react";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  youtubeHandle: string | null;
  unsubscribeToken: string;
  isActive: boolean;
  notifiedWeeks: number[];
  subscribedAt: string;
  lastNotifiedAt: string | null;
}

interface CountResp {
  total: number;
  active: number;
}

export default function AdminQuizSubscribersPage() {
  const [token, setToken] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "all" | "inactive">("active");
  const [count, setCount] = useState<CountResp | null>(null);
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filter === "active") params.set("active", "true");
    if (filter === "inactive") params.set("active", "false");
    const [c, list] = await Promise.all([
      fetch("/api/v1/admin/quiz/subscribers/count", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json() as Promise<CountResp>),
      fetch(`/api/v1/admin/quiz/subscribers?${params}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json() as Promise<Subscriber[]>),
    ]);
    setCount(c);
    setSubs(Array.isArray(list) ? list : []);
    setLoading(false);
  }, [token, filter]);

  useEffect(() => { void load(); }, [load]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }

  async function notifyNow() {
    if (!token) return;
    setNotifyBusy(true);
    try {
      const r = await fetch("/api/v1/admin/quiz/subscribers/notify-now", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json() as Promise<{ quizzesChecked: number; emailsSent: number; emailsFailed: number }>);
      flash(`✓ ${r.emailsSent}/${r.emailsSent + r.emailsFailed} emails sent across ${r.quizzesChecked} quiz(es)`);
      await load();
    } catch (e) {
      flash(`⚠ ${e instanceof Error ? e.message : "Notify failed"}`);
    } finally { setNotifyBusy(false); }
  }

  function exportCsv() {
    if (!subs) return;
    const header = ["email", "name", "youtube_handle", "is_active", "subscribed_at", "notified_weeks", "last_notified_at"];
    const rows = subs.map((s) => [
      s.email,
      s.name ?? "",
      s.youtubeHandle ?? "",
      String(s.isActive),
      s.subscribedAt,
      (s.notifiedWeeks ?? []).join(";"),
      s.lastNotifiedAt ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quiz_subscribers_${filter}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const filtered = (subs ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      s.email.toLowerCase().includes(q) ||
      (s.name ?? "").toLowerCase().includes(q) ||
      (s.youtubeHandle ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* ── Header / counts ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Active subscribers"
          value={count?.active ?? "—"}
          tone="emerald"
          hint="Will receive the next quiz reminder"
        />
        <StatCard
          label="Total ever subscribed"
          value={count?.total ?? "—"}
          tone="cyan"
          hint="Includes those who unsubscribed"
        />
        <StatCard
          label="Unsubscribed"
          value={count && typeof count.total === "number" && typeof count.active === "number"
            ? count.total - count.active
            : "—"}
          tone="slate"
          hint="Opted out at some point"
        />
      </div>

      {/* ── Filters + actions ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "active" | "all" | "inactive")}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
        >
          <option value="active">Active only</option>
          <option value="all">All subscribers</option>
          <option value="inactive">Unsubscribed only</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email / name / handle…"
          className="bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 w-72"
        />
        <span className="text-slate-400 text-sm self-center">
          {loading ? "Loading…" : `Showing ${filtered.length} of ${subs?.length ?? 0}`}
        </span>

        <button
          onClick={exportCsv}
          disabled={!subs || subs.length === 0}
          className="ml-auto px-3 py-2 bg-[#1e293b] border border-white/10 hover:bg-white/5 text-white text-sm font-medium rounded-xl disabled:opacity-40"
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={notifyNow}
          disabled={notifyBusy}
          className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
          title="Manually trigger the notify-due cron (sends emails for quizzes starting in next 15 min)"
        >
          {notifyBusy ? "Notifying…" : "📣 Notify now"}
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">YouTube</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Subscribed</th>
              <th className="text-left px-4 py-3 font-medium">Last notified</th>
              <th className="text-left px-4 py-3 font-medium">Weeks notified</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">
                      {(subs ?? []).length === 0
                        ? "No subscribers yet — share /quiz to start collecting."
                        : "No subscribers match this filter."}
                    </td>
                  </tr>
                ) : filtered.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                    <td className="px-4 py-3 text-white">{s.email}</td>
                    <td className="px-4 py-3 text-slate-300">{s.name || "—"}</td>
                    <td className="px-4 py-3 text-rose-400 text-xs font-mono">{s.youtubeHandle || "—"}</td>
                    <td className="px-4 py-3">
                      {s.isActive ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                          ✓ Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400">
                          unsubscribed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(s.subscribedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {s.lastNotifiedAt ? new Date(s.lastNotifiedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                      {(s.notifiedWeeks ?? []).length > 0
                        ? (s.notifiedWeeks ?? []).join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-[#0F1438] border border-amber-400/40 text-white px-4 py-2 rounded-xl shadow-xl text-sm max-w-md">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone, hint }: {
  label: string;
  value: number | string;
  tone: "emerald" | "cyan" | "slate";
  hint: string;
}) {
  const palette = {
    emerald: "border-emerald-500/30 text-emerald-300",
    cyan:    "border-cyan-500/30 text-cyan-300",
    slate:   "border-white/10 text-slate-400",
  }[tone];
  return (
    <div className={`bg-[#1e293b] border ${palette.split(" ")[0]} rounded-2xl px-5 py-4`}>
      <div className={`text-3xl font-bold ${palette.split(" ")[1]}`}>{value}</div>
      <div className="text-white font-semibold text-sm mt-0.5">{label}</div>
      <div className="text-slate-500 text-xs mt-1">{hint}</div>
    </div>
  );
}
