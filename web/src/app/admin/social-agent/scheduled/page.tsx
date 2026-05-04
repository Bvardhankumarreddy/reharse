"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR, CONTENT_TYPE_LABEL,
  type SocialPost,
} from "../_helpers";

function fmtDateGroup(d: string): string {
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);

  if (compareDate.getTime() === today.getTime()) return "Today";
  if (compareDate.getTime() === tomorrow.getTime()) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const res = await api<{ data: SocialPost[] }>(token, `/posts?status=approved&limit=200`);
      setPosts(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markPublished(id: string) {
    const externalUrl = prompt("Optional: paste the published URL (e.g. LinkedIn post link):") ?? "";
    setBusy(id);
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/posts/${id}/mark-published`, {
        method: "POST",
        body: JSON.stringify({ externalUrl }),
      });
      await load();
    } finally { setBusy(null); }
  }

  async function publishNow(id: string) {
    if (!confirm("Publish this LinkedIn post immediately?")) return;
    setBusy(id);
    const token = await fetchToken();
    if (!token) return;
    try {
      const post = await api<SocialPost>(token, `/posts/${id}/publish-now`, { method: "POST" });
      if (post.status === "failed" || post.failureReason) {
        alert(`Publish failed: ${post.failureReason ?? "unknown error"}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Publish failed");
    } finally { setBusy(null); }
  }

  async function reschedule(id: string, newAt: string) {
    setBusy(id);
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/posts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduledAt: new Date(newAt).toISOString() }),
      });
      setEditingSchedule(null);
      await load();
    } finally { setBusy(null); }
  }

  // Group posts by date (YYYY-MM-DD)
  const grouped = posts.reduce<Record<string, SocialPost[]>>((acc, p) => {
    const key = p.scheduledAt.slice(0, 10);
    (acc[key] = acc[key] ?? []).push(p);
    return acc;
  }, {});
  const sortedKeys = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-[#151B3D] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
          No approved posts yet. Approve posts from the Queue to see them here.
        </div>
      ) : (
        sortedKeys.map((dateKey) => (
          <div key={dateKey}>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#FFD700] mb-2">
              {fmtDateGroup(grouped[dateKey][0].scheduledAt)}
            </div>
            <div className="space-y-2">
              {grouped[dateKey].map((p) => (
                <div key={p.id} className="bg-[#151B3D] border border-white/10 rounded-2xl p-4">
                  <div className="flex items-start gap-3 mb-2 flex-wrap">
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: PLATFORM_COLOR[p.platform] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-white font-semibold">{PLATFORM_LABEL[p.platform]}</span>
                        <span className="text-[#6B7799]">·</span>
                        <span className="text-[#B8C5E0]">{CONTENT_TYPE_LABEL[p.contentType]}</span>
                        <span className="text-[#6B7799]">·</span>
                        <span className="text-[#FFD700] font-mono">
                          {new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {(p.platform === "linkedin_page" || p.platform === "linkedin_personal") && (
                          <span className="text-[10px] font-bold uppercase tracking-widest bg-[#00D4FF]/15 text-[#00D4FF] px-2 py-0.5 rounded">
                            🤖 Auto-publish
                          </span>
                        )}
                        {p.publishAttempts > 0 && (
                          <span className="text-[10px] font-bold text-[#FF5C7C]">
                            ⚠ {p.publishAttempts} failed attempt{p.publishAttempts > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <p className="text-[#B8C5E0] text-sm mt-1.5 line-clamp-3 whitespace-pre-wrap">
                        {p.textContent.slice(0, 250)}{p.textContent.length > 250 ? "…" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(p.textContent)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:text-white"
                    >
                      📋 Copy
                    </button>
                    {(p.platform === "linkedin_page" || p.platform === "linkedin_personal") && (
                      <button
                        onClick={() => publishNow(p.id)}
                        disabled={busy === p.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-50"
                      >
                        🚀 Publish Now
                      </button>
                    )}
                    <button
                      onClick={() => markPublished(p.id)}
                      disabled={busy === p.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 disabled:opacity-50"
                    >
                      ✅ Mark Published
                    </button>
                    {editingSchedule === p.id ? (
                      <input
                        type="datetime-local"
                        defaultValue={p.scheduledAt.slice(0, 16)}
                        onBlur={(e) => reschedule(p.id, e.target.value)}
                        className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark]"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => setEditingSchedule(p.id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:text-white"
                      >
                        🕒 Reschedule
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
