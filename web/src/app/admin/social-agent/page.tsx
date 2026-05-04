"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR, STATUS_COLOR, CONTENT_TYPE_LABEL,
  type SocialPost,
} from "./_helpers";

interface Stats {
  pending: number;
  scheduledToday: number;
  publishedThisWeek: number;
  generatedThisMonth: number;
  recent: SocialPost[];
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] mb-2">{label}</div>
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

export default function SocialAgentDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await fetchToken();
      if (!token) return;
      try {
        const s = await api<Stats>(token, "/stats");
        setStats(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load stats");
      }
    })();
  }, []);

  if (error) {
    return <div className="bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-4 text-[#FF5C7C]">{error}</div>;
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-[#151B3D] rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Approval"     value={stats.pending}            color="#FFD700" />
        <StatCard label="Scheduled Today"      value={stats.scheduledToday}     color="#00D4FF" />
        <StatCard label="Published This Week"  value={stats.publishedThisWeek}  color="#00F5A0" />
        <StatCard label="Generated This Month" value={stats.generatedThisMonth} color="#7C3AED" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/social-agent/generate"
          className="bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold px-6 py-3 rounded-xl shadow-[0_0_30px_rgba(0,212,255,0.3)] hover:shadow-[0_0_50px_rgba(0,212,255,0.5)] transition"
        >
          + Generate New Posts
        </Link>
        <Link
          href="/admin/social-agent/queue"
          className="bg-[#151B3D] border border-[#FFD700]/30 text-[#FFD700] font-semibold px-6 py-3 rounded-xl hover:bg-[#FFD700]/10 transition"
        >
          Review Queue ({stats.pending})
        </Link>
      </div>

      <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-bold">Recent Activity</h2>
        </div>
        {stats.recent.length === 0 ? (
          <div className="p-8 text-center text-[#6B7799] text-sm">No posts yet — click Generate to get started.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {stats.recent.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: PLATFORM_COLOR[p.platform] }}
                />
                <span className="text-white font-medium w-40 shrink-0 truncate">
                  {PLATFORM_LABEL[p.platform]}
                </span>
                <span className="text-[#6B7799] text-xs w-32 shrink-0">
                  {CONTENT_TYPE_LABEL[p.contentType]}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status]}`}>
                  {p.status.replace("_", " ")}
                </span>
                <span className="text-[#B8C5E0] text-xs flex-1 truncate">
                  {p.textContent.slice(0, 80)}
                </span>
                <span className="text-[#6B7799] text-xs">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
