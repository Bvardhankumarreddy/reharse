"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR,
  type SocialPlatform,
} from "../_helpers";

interface CompetitorNote {
  id: string;
  content: string;
  referenceUrl: string | null;
  authorEmail: string | null;
  createdAt: string;
}

interface Competitor {
  id: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  url: string | null;
  followerCount: number | null;
  followerCountUpdatedAt: string | null;
  description: string | null;
  notes: CompetitorNote[];
  createdAt: string;
  updatedAt: string;
}

const PLATFORMS: SocialPlatform[] = [
  "linkedin_page", "linkedin_personal",
  "instagram_feed", "youtube_community",
];

const inputCls =
  "w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]";

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    platform: "linkedin_page" as SocialPlatform,
    handle: "",
    displayName: "",
    url: "",
    followerCount: "",
    description: "",
  });
  const [noteInputs, setNoteInputs] = useState<Record<string, { content: string; referenceUrl: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const list = await api<Competitor[]>(token, "/competitors");
      setCompetitors(list);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createCompetitor() {
    if (!form.handle.trim() || !form.displayName.trim()) return;
    setBusy("__new");
    const token = await fetchToken();
    if (!token) { setBusy(null); return; }
    try {
      await api(token, "/competitors", {
        method: "POST",
        body: JSON.stringify({
          platform: form.platform,
          handle: form.handle.trim(),
          displayName: form.displayName.trim(),
          url: form.url.trim() || undefined,
          followerCount: form.followerCount ? parseInt(form.followerCount, 10) : undefined,
          description: form.description.trim() || undefined,
        }),
      });
      setForm({ platform: form.platform, handle: "", displayName: "", url: "", followerCount: "", description: "" });
      setShowAdd(false);
      void load();
    } finally { setBusy(null); }
  }

  async function deleteCompetitor(id: string) {
    if (!confirm("Delete this competitor and all notes?")) return;
    setBusy(id);
    const token = await fetchToken();
    if (!token) { setBusy(null); return; }
    try {
      await api(token, `/competitors/${id}`, { method: "DELETE" });
      void load();
    } finally { setBusy(null); }
  }

  async function updateFollowerCount(id: string, current: number | null) {
    const next = prompt("New follower count:", String(current ?? ""));
    if (next === null) return;
    const n = parseInt(next, 10);
    if (isNaN(n)) return;
    setBusy(id);
    const token = await fetchToken();
    if (!token) { setBusy(null); return; }
    try {
      await api(token, `/competitors/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ followerCount: n }),
      });
      void load();
    } finally { setBusy(null); }
  }

  async function addNote(competitorId: string) {
    const input = noteInputs[competitorId];
    if (!input?.content?.trim()) return;
    setBusy(competitorId);
    const token = await fetchToken();
    if (!token) { setBusy(null); return; }
    try {
      await api(token, `/competitors/${competitorId}/notes`, {
        method: "POST",
        body: JSON.stringify({
          content: input.content.trim(),
          referenceUrl: input.referenceUrl?.trim() || undefined,
        }),
      });
      setNoteInputs({ ...noteInputs, [competitorId]: { content: "", referenceUrl: "" } });
      void load();
    } finally { setBusy(null); }
  }

  async function deleteNote(noteId: string) {
    setBusy(noteId);
    const token = await fetchToken();
    if (!token) { setBusy(null); return; }
    try {
      await api(token, `/competitors/notes/${noteId}`, { method: "DELETE" });
      void load();
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl p-4 text-sm text-[#FFD700]">
        ⚠ <strong>Manual tracking only.</strong> Programmatic scraping of LinkedIn / Instagram / YouTube
        competitor data is against their ToS. Use this page to track competitors, paste links to their
        posts you want to study, and write notes on what&apos;s working for them.
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-white font-bold text-lg">Competitor Channels ({competitors.length})</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold text-sm rounded-xl"
        >
          {showAdd ? "Cancel" : "+ Add Competitor"}
        </button>
      </div>

      {showAdd && (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value as SocialPlatform })}
                className={inputCls}
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1">Handle *</label>
              <input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@username or page slug" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1">Display Name *</label>
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="e.g., Krish Naik" className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1">Followers</label>
              <input type="number" value={form.followerCount} onChange={(e) => setForm({ ...form, followerCount: e.target.value })} placeholder="Optional" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1">URL</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Why are we tracking them?" className={inputCls} />
          </div>
          <button
            onClick={createCompetitor}
            disabled={busy === "__new" || !form.handle.trim() || !form.displayName.trim()}
            className="bg-[#00F5A0] text-[#0A0E27] font-bold px-5 py-2 rounded-xl disabled:opacity-50"
          >
            {busy === "__new" ? "Adding..." : "Add Competitor"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-[#151B3D] rounded-2xl animate-pulse" />)}
        </div>
      ) : competitors.length === 0 ? (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
          No competitors tracked yet. Click <strong>+ Add Competitor</strong> to start.
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map((c) => (
            <div key={c.id} className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ backgroundColor: PLATFORM_COLOR[c.platform] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold">{c.displayName}</span>
                      <span className="text-[#B8C5E0] text-sm">{c.handle}</span>
                      <span className="text-[10px] text-[#6B7799]">· {PLATFORM_LABEL[c.platform]}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-[#6B7799] mt-1 flex-wrap">
                      {c.followerCount != null && (
                        <span>
                          <strong className="text-[#FFD700]">{c.followerCount.toLocaleString()}</strong> followers
                          <button onClick={() => updateFollowerCount(c.id, c.followerCount)} className="ml-1 text-[#00D4FF] text-[10px]">[update]</button>
                        </span>
                      )}
                      {c.followerCount == null && (
                        <button onClick={() => updateFollowerCount(c.id, null)} className="text-[#00D4FF] text-[10px]">+ Add follower count</button>
                      )}
                      {c.url && <a href={c.url} target="_blank" rel="noopener" className="text-[#00D4FF] hover:underline">Open ↗</a>}
                    </div>
                    {c.description && <p className="text-[#B8C5E0] text-sm mt-2">{c.description}</p>}
                  </div>
                </div>
                <button
                  onClick={() => deleteCompetitor(c.id)}
                  disabled={busy === c.id}
                  className="text-[#FF5C7C] text-xs hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </div>

              {/* Notes */}
              <div className="border-t border-white/5 pt-3 space-y-2">
                {c.notes.length > 0 && (
                  <div className="space-y-2">
                    {c.notes.map((n) => (
                      <div key={n.id} className="bg-[#0A0E27]/60 rounded-lg p-3 flex items-start gap-3 text-sm">
                        <div className="flex-1">
                          <p className="text-[#B8C5E0]">{n.content}</p>
                          <div className="text-[10px] text-[#6B7799] mt-1">
                            {new Date(n.createdAt).toLocaleString()} · {n.authorEmail}
                            {n.referenceUrl && (
                              <> · <a href={n.referenceUrl} target="_blank" rel="noopener" className="text-[#00D4FF] hover:underline">link</a></>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteNote(n.id)}
                          disabled={busy === n.id}
                          className="text-[#FF5C7C] text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={noteInputs[c.id]?.content ?? ""}
                    onChange={(e) => setNoteInputs({ ...noteInputs, [c.id]: { ...noteInputs[c.id], content: e.target.value, referenceUrl: noteInputs[c.id]?.referenceUrl ?? "" } })}
                    placeholder="Add a note about a post or pattern…"
                    className={inputCls + " flex-1"}
                  />
                  <input
                    value={noteInputs[c.id]?.referenceUrl ?? ""}
                    onChange={(e) => setNoteInputs({ ...noteInputs, [c.id]: { ...noteInputs[c.id], content: noteInputs[c.id]?.content ?? "", referenceUrl: e.target.value } })}
                    placeholder="Optional URL"
                    className={inputCls + " w-48"}
                  />
                  <button
                    onClick={() => addNote(c.id)}
                    disabled={busy === c.id || !noteInputs[c.id]?.content?.trim()}
                    className="bg-[#00F5A0]/20 text-[#00F5A0] px-3 rounded-xl disabled:opacity-30 text-sm border border-[#00F5A0]/30"
                  >
                    + Note
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
