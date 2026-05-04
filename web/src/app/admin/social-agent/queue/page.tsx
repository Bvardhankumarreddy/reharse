"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR, STATUS_COLOR, CONTENT_TYPE_LABEL,
  type SocialPost, type SocialPostStatus, type SocialPlatform,
} from "../_helpers";

const PLATFORMS: SocialPlatform[] = [
  "linkedin_page", "linkedin_personal",
  "instagram_feed", "instagram_story",
  "whatsapp_status", "youtube_community",
];

function PostCard({ post, onChange }: { post: SocialPost; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.textContent);
  const [busy, setBusy] = useState(false);

  const accent = PLATFORM_COLOR[post.platform];
  const charCount = post.textContent.length;
  const lineCount = post.textContent.split("\n").length;
  const whatsappWarning = post.platform === "whatsapp_status" && (charCount > 700 || lineCount > 10);

  async function approve() {
    setBusy(true);
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/posts/${post.id}/approve`, { method: "POST" });
      onChange();
    } finally { setBusy(false); }
  }

  async function regenerate() {
    if (!confirm("Replace existing text with a fresh Claude generation? Your current text will be lost.")) return;
    setBusy(true);
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/posts/${post.id}/regenerate`, { method: "POST" });
      onChange();
    } finally { setBusy(false); }
  }

  async function reject() {
    if (!confirm("Reject this post?")) return;
    setBusy(true);
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/posts/${post.id}/reject`, { method: "POST" });
      onChange();
    } finally { setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true);
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ textContent: editText }),
      });
      setEditing(false);
      onChange();
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between gap-3 border-b"
        style={{ borderColor: `${accent}30`, backgroundColor: `${accent}10` }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
          <span className="text-white text-sm font-semibold">{PLATFORM_LABEL[post.platform]}</span>
          <span className="text-[#6B7799] text-xs">·</span>
          <span className="text-[#B8C5E0] text-xs">{CONTENT_TYPE_LABEL[post.contentType]}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[post.status]}`}>
            {post.status.replace("_", " ")}
          </span>
        </div>
        <div className="text-[#6B7799] text-xs whitespace-nowrap">
          📅 {new Date(post.scheduledAt).toLocaleString()}
        </div>
      </div>

      {editing ? (
        <div className="p-4">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={Math.max(8, Math.min(20, editText.split("\n").length + 2))}
            className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-[13px] text-[#B8C5E0] font-mono leading-relaxed focus:outline-none focus:border-[#00D4FF]"
          />
          <div className="text-[11px] text-[#6B7799] mt-2 flex items-center justify-between">
            <span>{editText.length} chars · {editText.split("\n").length} lines</span>
            {post.platform === "whatsapp_status" && (editText.length > 700 || editText.split("\n").length > 10) && (
              <span className="text-[#FF5C7C] font-medium">⚠ Long for WhatsApp</span>
            )}
          </div>
        </div>
      ) : (
        <pre className="px-4 py-3 text-[13px] text-[#B8C5E0] whitespace-pre-wrap font-mono leading-relaxed">
          {post.textContent}
        </pre>
      )}

      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[11px] text-[#6B7799]">
        <span>{charCount} chars · {lineCount} lines</span>
        {whatsappWarning && (
          <span className="text-[#FF5C7C] font-medium">
            ⚠ Long for WhatsApp ({charCount > 700 ? `${charCount} chars` : `${lineCount} lines`})
          </span>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/5 flex flex-wrap gap-2">
        {!editing && (
          <>
            <ActionBtn label="✏️ Edit"       onClick={() => { setEditText(post.textContent); setEditing(true); }} />
            <ActionBtn label="📋 Copy"       onClick={() => navigator.clipboard.writeText(post.textContent)} />
            <ActionBtn label="🔄 Regenerate" onClick={regenerate} disabled={busy} />
            {post.status === "pending_approval" && (
              <ActionBtn label="✅ Approve" onClick={approve} disabled={busy} accent="#00F5A0" />
            )}
            <ActionBtn label="❌ Reject" onClick={reject} disabled={busy} accent="#FF5C7C" />
          </>
        )}
        {editing && (
          <>
            <ActionBtn label="💾 Save"   onClick={saveEdit}            disabled={busy} accent="#00D4FF" />
            <ActionBtn label="Cancel"   onClick={() => setEditing(false)} disabled={busy} />
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, accent }: {
  label: string; onClick: () => void; disabled?: boolean; accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:text-white hover:bg-white/5 disabled:opacity-50 transition"
      style={accent ? { color: accent, borderColor: `${accent}40` } : undefined}
    >
      {label}
    </button>
  );
}

export default function QueuePage() {
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<SocialPostStatus | "all">("pending_approval");
  const [filterPlatform, setFilterPlatform] = useState<SocialPlatform | "">("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(searchParams.get("just_generated") ? "✓ Posts generated. Review them below." : null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    const params = new URLSearchParams({ status: filterStatus, limit: "100" });
    if (filterPlatform) params.set("platform", filterPlatform);
    if (search) params.set("search", search);
    try {
      const res = await api<{ data: SocialPost[] }>(token, `/posts?${params}`);
      setPosts(res.data);
    } finally { setLoading(false); }
  }, [filterStatus, filterPlatform, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(null), 4000); return () => clearTimeout(id); } }, [toast]);

  return (
    <div className="space-y-4">
      {toast && (
        <div className="bg-[#00F5A0]/10 border border-[#00F5A0]/30 rounded-xl p-3 text-[#00F5A0] text-sm">
          {toast}
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search post text..."
          className="bg-[#151B3D] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF] w-64"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as SocialPostStatus | "all")}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="pending_approval">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value as SocialPlatform | "")}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
        <span className="ml-auto text-[#B8C5E0] text-sm">{posts.length} post{posts.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-[#151B3D] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
          No posts match these filters.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => <PostCard key={p.id} post={p} onChange={load} />)}
        </div>
      )}
    </div>
  );
}
