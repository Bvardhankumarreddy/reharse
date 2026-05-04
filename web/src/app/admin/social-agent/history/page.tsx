"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR, CONTENT_TYPE_LABEL,
  type SocialPost, type SocialPlatform, type SocialContentType,
} from "../_helpers";

const PLATFORMS: SocialPlatform[] = [
  "linkedin_page", "linkedin_personal",
  "instagram_feed", "instagram_story",
  "whatsapp_status", "youtube_community",
];

const CONTENT_TYPES: SocialContentType[] = [
  "lesson_drop", "quiz_winners", "quiz_announcement", "engagement_post", "custom",
];

export default function HistoryPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState<SocialPlatform | "">("");
  const [filterContentType, setFilterContentType] = useState<SocialContentType | "">("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    const params = new URLSearchParams({ status: "published_manual", limit: "200" });
    if (filterPlatform) params.set("platform", filterPlatform);
    if (filterContentType) params.set("contentType", filterContentType);
    try {
      const res = await api<{ data: SocialPost[] }>(token, `/posts?${params}`);
      setPosts(res.data);
    } finally { setLoading(false); }
  }, [filterPlatform, filterContentType]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value as SocialPlatform | "")}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
        <select
          value={filterContentType}
          onChange={(e) => setFilterContentType(e.target.value as SocialContentType | "")}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All types</option>
          {CONTENT_TYPES.map((t) => <option key={t} value={t}>{CONTENT_TYPE_LABEL[t]}</option>)}
        </select>
        <span className="ml-auto text-[#B8C5E0] text-sm self-center">{posts.length} published</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-[#151B3D] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
          No published posts yet. Mark approved posts as published to see them here.
        </div>
      ) : (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[#6B7799] text-[10px] uppercase tracking-widest">
                <th className="text-left px-4 py-3 font-semibold">Published</th>
                <th className="text-left px-4 py-3 font-semibold">Platform</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">Content</th>
                <th className="text-left px-4 py-3 font-semibold">Link</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="border-b border-white/5 last:border-0 hover:bg-white/3 cursor-pointer"
                >
                  <td className="px-4 py-3 text-[#B8C5E0] text-xs whitespace-nowrap">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-white text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[p.platform] }} />
                      {PLATFORM_LABEL[p.platform]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#B8C5E0] text-xs">{CONTENT_TYPE_LABEL[p.contentType]}</td>
                  <td className="px-4 py-3 text-[#B8C5E0] text-xs">
                    {expanded === p.id ? (
                      <pre className="whitespace-pre-wrap font-mono">{p.textContent}</pre>
                    ) : (
                      <span>{p.textContent.slice(0, 80)}{p.textContent.length > 80 ? "…" : ""}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.externalUrl ? (
                      <a
                        href={p.externalUrl}
                        target="_blank"
                        rel="noopener"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#00D4FF] hover:underline text-xs"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-[#6B7799] text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
