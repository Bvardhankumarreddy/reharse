"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  currentStreak: number;
  longestStreak: number;
  sessionCount: number;
  onboardingCompleted: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastActiveDate: string | null;
}

interface UsersResponse {
  data: AdminUser[];
  total: number;
  page: number;
  pages: number;
}

const TIERS = ["", "free", "pro"];
const STATUSES = ["", "active", "past_due", "cancelled"];

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.session?.token) setToken(data.session.token);
    });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (tier) params.set("tier", tier);
      if (status) params.set("status", status);
      const res = await fetch(`/api/v1/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: UsersResponse = await res.json();
      setUsers(json.data);
      setTotal(json.total);
      setPages(json.pages);
    } finally {
      setLoading(false);
    }
  }, [token, page, search, tier, status]);

  useEffect(() => { void load(); }, [load]);

  // Debounce search
  useEffect(() => { setPage(1); }, [search, tier, status]);

  function tierBadge(t: string) {
    return t === "pro"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
      : "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#1e293b] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="past_due">Past due</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="ml-auto text-slate-400 text-sm self-center">{total} users</span>
      </div>

      {/* Table */}
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Plan</th>
              <th className="text-left px-4 py-3 font-medium">Sessions</th>
              <th className="text-left px-4 py-3 font-medium">Streak</th>
              <th className="text-left px-4 py-3 font-medium">Last Active</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => router.push(`/admin/users/${u.id}`)}
                    className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {u.imageUrl ? (
                          <img src={u.imageUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-xs font-bold">
                            {(u.firstName?.[0] ?? u.email[0]).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-white font-medium">
                            {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : "—"}
                            {u.isAdmin && <span className="ml-2 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">Admin</span>}
                          </div>
                          <div className="text-slate-500 text-xs">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${tierBadge(u.subscriptionTier)}`}>
                        {u.subscriptionTier}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300">{(u as any).sessionCount ?? 0}</td>
                    <td className="px-4 py-4">
                      <span className="flex items-center gap-1 text-slate-300">
                        🔥 {u.currentStreak}
                        {u.longestStreak > u.currentStreak && (
                          <span className="text-slate-500 text-xs">(best {u.longestStreak})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs">
                      {u.lastActiveDate ? new Date(u.lastActiveDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40 hover:text-white transition"
          >
            ← Prev
          </button>
          <span className="text-slate-400 text-sm">Page {page} of {pages}</span>
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-[#1e293b] border border-white/10 text-slate-400 text-sm disabled:opacity-40 hover:text-white transition"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
