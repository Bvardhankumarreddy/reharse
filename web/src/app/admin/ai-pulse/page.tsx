"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api, fetchToken,
  type AiPulseVertical, type NewsItem, type Script, type VerticalRow,
  type Memory, type MemoryType, type Postmortem, type DistributionPackage,
  type AiPulseScene, type AiPulseVoiceoverSpec, type AiPulseMusicSpec,
  VERTICAL_LABELS, VERTICAL_DOW, MEMORY_TYPE_LABELS, MEMORY_TYPE_EMOJI,
} from "./_helpers";

type Tab = "queue" | "news" | "verticals" | "learnings";

export default function AiPulseAdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { void fetchToken().then(setToken); }, []);

  const onToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  if (token === null) {
    return (
      <div className="min-h-screen bg-[#0A0E27] text-white p-8">
        <div className="w-8 h-8 mx-auto rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E27] text-white">
      <div className="max-w-6xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">📡 AI Pulse</h1>
            <p className="text-[12px] text-[#6B7799]">
              Multi-vertical news pipeline · 06:00 IST daily cron · Sun → AI Quick Bytes
            </p>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex gap-2 border-b border-white/10 mb-6">
          {(["queue", "news", "verticals", "learnings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "px-4 py-2 text-sm font-semibold border-b-2 transition " +
                (tab === t
                  ? "border-[#00D4FF] text-[#00D4FF]"
                  : "border-transparent text-[#6B7799] hover:text-white")
              }
            >
              {t === "queue" ? "Approval Queue"
                : t === "news" ? "Ingested News"
                : t === "verticals" ? "Verticals"
                : "🧠 Learnings"}
            </button>
          ))}
        </div>

        {tab === "queue"     && <QueuePanel     token={token} onToast={onToast} />}
        {tab === "news"      && <NewsPanel      token={token} onToast={onToast} />}
        {tab === "verticals" && <VerticalsPanel token={token} onToast={onToast} />}
        {tab === "learnings" && <LearningsPanel token={token} onToast={onToast} />}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-[#151B3D] border border-[#00D4FF]/40 text-white px-4 py-2 rounded-xl shadow-xl text-sm max-w-md">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Verticals tab — toggle enable + manual trigger ──────────────────────
function VerticalsPanel({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<VerticalRow[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<VerticalRow[]>(token, "/verticals"));
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }, [token, onToast]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(v: AiPulseVertical, enabled: boolean) {
    setBusyKey(`toggle-${v}`);
    try {
      await api(token, `/verticals/${v}/enable`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      onToast(`✓ ${VERTICAL_LABELS[v]} ${enabled ? "enabled" : "disabled"}`);
      await load();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusyKey(null); }
  }

  async function ingestNow() {
    setBusyKey("ingest");
    try {
      const r = await api<{ new: number; duplicates: number; total: number }>(
        token, "/ingest", { method: "POST" });
      onToast(`✓ Ingest: ${r.new} new · ${r.duplicates} dup · ${r.total} total`);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusyKey(null); }
  }

  async function generateNow(v: AiPulseVertical, topN: number) {
    setBusyKey(`gen-${v}`);
    onToast(`Generating top ${topN} for ${VERTICAL_LABELS[v]} — ~${30 * topN}-${60 * topN}s …`);
    try {
      const r = await api<{
        generated: number;
        requested: number;
        scripts: Array<{ newsItemId: string; scriptId: string; headline: string }>;
      }>(token, `/verticals/${v}/generate`, { method: "POST" });
      if (r.generated === 0) onToast(`⚠ No eligible news for ${VERTICAL_LABELS[v]} — run Ingest first`);
      else onToast(`✓ Generated ${r.generated}/${r.requested} scripts → open Queue tab`);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusyKey(null); }
  }

  if (!rows) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">RSS Ingest</div>
          <div className="text-[11px] text-[#6B7799]">Pulls every enabled source. Cron runs every 4h.</div>
        </div>
        <button
          onClick={ingestNow}
          disabled={busyKey === "ingest"}
          className="px-4 py-2 bg-[#00D4FF]/15 hover:bg-[#00D4FF]/25 border border-[#00D4FF]/40 text-[#00D4FF] text-sm font-semibold rounded-xl disabled:opacity-50"
        >
          {busyKey === "ingest" ? "Ingesting…" : "🔄 Ingest now"}
        </button>
      </div>

      <div className="bg-[#151B3D] border border-white/5 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[10px] text-[#6B7799] uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Vertical</th>
              <th className="text-left px-4 py-3 font-medium">Day</th>
              <th className="text-left px-4 py-3 font-medium">India mix</th>
              <th className="text-left px-4 py-3 font-medium">Top-N / run</th>
              <th className="text-left px-4 py-3 font-medium">Enabled</th>
              <th className="text-left px-4 py-3 font-medium">Generate now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vertical} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.display_name}</div>
                  <div className="text-[11px] text-[#6B7799]">{r.description}</div>
                </td>
                <td className="px-4 py-3 text-[#B8C5E0]">{VERTICAL_DOW[r.vertical]}</td>
                <td className="px-4 py-3 text-[#B8C5E0]">{r.india_mix_percent}%</td>
                <td className="px-4 py-3 text-[#B8C5E0] font-mono">{r.top_n_per_run}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggle(r.vertical, !r.enabled)}
                    disabled={busyKey === `toggle-${r.vertical}`}
                    className={
                      "px-3 py-1 text-xs font-bold rounded-full border transition disabled:opacity-50 " +
                      (r.enabled
                        ? "bg-[#00F5A0]/15 border-[#00F5A0]/40 text-[#00F5A0]"
                        : "bg-white/5 border-white/15 text-[#6B7799]")
                    }
                  >
                    {r.enabled ? "✓ ON" : "OFF"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => generateNow(r.vertical, r.top_n_per_run)}
                    disabled={!r.enabled || busyKey === `gen-${r.vertical}`}
                    title={r.enabled ? `Generate top ${r.top_n_per_run} stories now` : "Enable the vertical first"}
                    className="px-3 py-1 text-xs font-semibold rounded-lg border border-white/10 text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {busyKey === `gen-${r.vertical}` ? "Working…" : `⚡ Generate ${r.top_n_per_run}`}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── News tab — ingested items ──────────────────────────────────────────
function NewsPanel({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [vertical, setVertical] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (vertical) qs.set("vertical", vertical);
      if (status) qs.set("status", status);
      qs.set("limit", "50");
      setItems(await api<NewsItem[]>(token, `/news?${qs}`));
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }, [token, vertical, status, onToast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All verticals</option>
          {Object.entries(VERTICAL_LABELS).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="scored">scored</option>
          <option value="selected">selected</option>
          <option value="processed">processed</option>
          <option value="rejected">rejected</option>
        </select>
      </div>

      {!items ? <Loading /> : items.length === 0 ? (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-8 text-center text-[#6B7799] text-sm">
          No news items. Run "🔄 Ingest now" in the Verticals tab to pull from RSS sources.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className="bg-[#151B3D] border border-white/5 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{n.headline}</div>
                  <div className="text-[11px] text-[#6B7799] mt-1">
                    {VERTICAL_LABELS[n.vertical]} · {n.source_name}
                    {n.published_at && <> · {new Date(n.published_at).toLocaleString()}</>}
                  </div>
                  {n.summary && (
                    <div className="text-[12px] text-[#B8C5E0] mt-2 line-clamp-2">{n.summary}</div>
                  )}
                  {n.total_score != null && (
                    <div className="text-[11px] text-[#FFB020] mt-2">
                      score {Number(n.total_score).toFixed(2)}
                      {n.relevance_score != null && <> · rel {Number(n.relevance_score).toFixed(2)}</>}
                      {n.freshness_score != null && <> · fresh {Number(n.freshness_score).toFixed(2)}</>}
                      {n.india_relevance_score != null && <> · india {Number(n.india_relevance_score).toFixed(2)}</>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={
                    "px-2 py-0.5 text-[10px] font-bold rounded-full " +
                    (n.status === "selected" ? "bg-[#00D4FF]/20 text-[#00D4FF]"
                      : n.status === "processed" ? "bg-[#00F5A0]/15 text-[#00F5A0]"
                      : n.status === "scored" ? "bg-[#FFB020]/15 text-[#FFB020]"
                      : "bg-white/10 text-[#6B7799]")
                  }>
                    {n.status}
                  </span>
                  <a
                    href={n.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#00D4FF] hover:underline"
                  >
                    Open source →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Queue tab — scripts per status filter + per-script detail ──────────
type QueueStatus = "pending_review" | "approved" | "published" | "rejected" | "all";
const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved · awaiting publish",
  published: "Published",
  rejected: "Rejected",
  all: "All",
};
const QUEUE_STATUS_EMPTY: Record<QueueStatus, string> = {
  pending_review: "No scripts pending approval. Use Verticals → ⚡ Generate to create one.",
  approved: "No approved scripts waiting to publish.",
  published: "No published scripts yet. Mark one as published after uploading to YouTube.",
  rejected: "No rejected scripts.",
  all: "No scripts at all yet.",
};

function QueuePanel({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [scripts, setScripts] = useState<Script[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QueueStatus>("pending_review");

  const load = useCallback(async () => {
    try {
      const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      setScripts(await api<Script[]>(token, `/approval/queue${qs}`));
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }, [token, statusFilter, onToast]);

  useEffect(() => { void load(); }, [load]);

  const statusTabs: QueueStatus[] = ["pending_review", "approved", "published", "rejected", "all"];

  const filterBar = (
    <div className="flex flex-wrap gap-2 mb-3">
      {statusTabs.map((s) => (
        <button
          key={s}
          onClick={() => { setOpenId(null); setStatusFilter(s); }}
          className={
            "px-3 py-1.5 rounded-full text-xs font-medium transition " +
            (statusFilter === s
              ? "bg-[#00D4FF] text-[#0A0E27]"
              : "bg-white/5 text-[#B8C5E0] hover:bg-white/10")
          }
        >
          {QUEUE_STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );

  if (!scripts) return <>{filterBar}<Loading /></>;
  if (scripts.length === 0) {
    return (
      <>
        {filterBar}
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-8 text-center text-[#6B7799] text-sm">
          {QUEUE_STATUS_EMPTY[statusFilter]}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {filterBar}
      {scripts.map((s) => (
        <div key={s.id} className="bg-[#151B3D] border border-white/5 rounded-2xl overflow-hidden">
          <button
            onClick={() => setOpenId(openId === s.id ? null : s.id)}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">
                {s.english_title ?? "(no title)"}
              </div>
              <div className="text-[11px] text-[#6B7799] mt-0.5">
                {VERTICAL_LABELS[s.vertical]}
                {" · "}
                {s.english_word_count ?? 0} EN words
                {s.telugu_word_count != null && <> · {s.telugu_word_count} TE words</>}
                {" · "}
                {new Date(s.created_at).toLocaleString()}
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFB020]/15 text-[#FFB020] shrink-0">
              {s.approval_status}
            </span>
            <span className="text-xs text-[#6B7799]">{openId === s.id ? "▾" : "▸"}</span>
          </button>
          {openId === s.id && (
            <ScriptDetail token={token} scriptId={s.id} onToast={onToast} onReload={load} />
          )}
        </div>
      ))}
    </div>
  );
}

function ScriptDetail({
  token, scriptId, onToast, onReload,
}: {
  token: string;
  scriptId: string;
  onToast: (m: string) => void;
  onReload: () => Promise<void>;
}) {
  const [script, setScript] = useState<Script | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setScript(await api<Script>(token, `/approval/${scriptId}`));
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }, [token, scriptId, onToast]);

  useEffect(() => { void load(); }, [load]);

  async function action(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try { await fn(); onToast(`✓ ${label}`); await load(); await onReload(); }
    catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function copyToClipboard(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); onToast(`Copied ${label}`); }
    catch { onToast("Clipboard blocked"); }
  }

  if (!script) return <div className="px-4 py-6 text-center text-[#6B7799] text-xs">Loading…</div>;

  const dist = script.distribution_package;
  const distTe = script.telugu_distribution_package;

  const renderDistribution = (
    pkg: DistributionPackage | null,
    sectionTitle: string,
    accent: string,
  ) => {
    if (!pkg) {
      return (
        <Section title={sectionTitle}>
          <div className={`text-[11px] text-[#6B7799] border border-dashed ${accent} rounded-lg p-3`}>
            Not generated yet. Use the regen button above to create it.
          </div>
        </Section>
      );
    }
    return (
      <Section title={sectionTitle}>
        <div className="space-y-3">
          {pkg.youtube && (
            <PlatformBlock title="▶️ YouTube" onCopy={(v) => copyToClipboard(v, "YouTube")}>
              <Field label="Title" value={pkg.youtube.title} />
              <Field label="Description" value={pkg.youtube.description} multiline />
              <Field label="Tags" value={pkg.youtube.tags.join(", ")} />
              <Field label="Pinned comment" value={pkg.youtube.pinned_comment} multiline />
            </PlatformBlock>
          )}
          {pkg.instagram && (
            <PlatformBlock title="📸 Instagram">
              <Field label="Full text" value={pkg.instagram.full_text} multiline />
              <Field label="Pinned comment" value={pkg.instagram.pinned_comment} multiline />
            </PlatformBlock>
          )}
          {pkg.linkedin && (
            <PlatformBlock title="💼 LinkedIn">
              <Field label="Post" value={pkg.linkedin.full_text} multiline />
            </PlatformBlock>
          )}
          {pkg.whatsapp_channel && (
            <PlatformBlock title="💬 WhatsApp Channel">
              <Field label="Message" value={pkg.whatsapp_channel.full_text} multiline />
            </PlatformBlock>
          )}
          {pkg.whatsapp_status && (
            <PlatformBlock title="📱 WhatsApp Status">
              <Field label="Status" value={pkg.whatsapp_status.full_text} multiline />
            </PlatformBlock>
          )}
        </div>
      </Section>
    );
  };

  return (
    <div className="border-t border-white/5 px-4 py-4 space-y-5 bg-[#0F1330]">
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => action("Approved → ready for HeyGen upload",
            () => api(token, `/approval/${scriptId}/approve`, { method: "POST" }))}
          disabled={!!busy || script.approval_status === "approved"}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00F5A0]/15 border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/25 disabled:opacity-40"
        >
          {busy === "Approved → ready for HeyGen upload" ? "…" : "✓ Approve"}
        </button>
        <button
          onClick={() => {
            const reason = prompt("Reason (optional):") ?? "";
            void action("Rejected",
              () => api(token, `/approval/${scriptId}/reject`, {
                method: "POST",
                body: JSON.stringify({ reason }),
              }));
          }}
          disabled={!!busy}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-40"
        >
          ✕ Reject
        </button>
        <button
          onClick={() => action("Regenerated script",
            () => api(token, `/approval/${scriptId}/regenerate-script`, { method: "POST" }))}
          disabled={!!busy}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-white hover:bg-white/5 disabled:opacity-40"
        >
          🔁 Regen script
        </button>
        <button
          onClick={() => action("Regenerated thumbnails",
            () => api(token, `/approval/${scriptId}/regenerate-thumbnails`, { method: "POST" }))}
          disabled={!!busy}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-white hover:bg-white/5 disabled:opacity-40"
        >
          🔁 Regen thumbnails
        </button>
        <button
          onClick={() => action("Regenerated EN distribution",
            () => api(token, `/approval/${scriptId}/regenerate-distribution`, { method: "POST" }))}
          disabled={!!busy}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-white hover:bg-white/5 disabled:opacity-40"
        >
          🔁 Regen EN distribution
        </button>
        <button
          onClick={() => action("Regenerated TE distribution",
            () => api(token, `/approval/${scriptId}/regenerate-distribution?lang=te`, { method: "POST" }))}
          disabled={!!busy || !script.telugu_full_script}
          title={script.telugu_full_script ? "Generate Telugu distribution" : "Needs Telugu script first"}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#FFB020]/30 text-[#FFB020] hover:bg-[#FFB020]/10 disabled:opacity-40"
        >
          🔁 Regen TE distribution
        </button>
        <button
          onClick={() => action("Generated EN scenes",
            () => api(token, `/approval/${scriptId}/scenes/generate?language=en`, { method: "POST" }))}
          disabled={!!busy || !script.english_full_script}
          title={script.english_full_script ? "Break the English script into cinematic scenes" : "Needs an English script first"}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#9D7DFF]/40 text-[#9D7DFF] hover:bg-[#9D7DFF]/10 disabled:opacity-40"
        >
          {script.scenes ? "🔄 Regen EN scenes" : "✨ Generate EN scenes"}
        </button>
        <button
          onClick={() => action("Generated TE scenes",
            () => api(token, `/approval/${scriptId}/scenes/generate?language=te`, { method: "POST" }))}
          disabled={!!busy || !script.telugu_full_script}
          title={script.telugu_full_script ? "Break the Telugu script into cinematic scenes" : "Needs a Telugu script first"}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#9D7DFF]/40 text-[#9D7DFF] hover:bg-[#9D7DFF]/10 disabled:opacity-40"
        >
          {script.scenesTe ? "🔄 Regen TE scenes" : "✨ Generate TE scenes"}
        </button>
        <button
          onClick={() => {
            const en = prompt("English YouTube URL (leave blank to skip):") ?? "";
            const te = prompt("Telugu YouTube URL (leave blank to skip):") ?? "";
            if (!en && !te) return;
            void action("Marked published",
              () => api(token, `/approval/${scriptId}/mark-published`, {
                method: "POST",
                body: JSON.stringify({
                  english_video_url: en || undefined,
                  telugu_video_url: te || undefined,
                }),
              }));
          }}
          disabled={!!busy || script.approval_status !== "approved"}
          title={script.approval_status === "approved" ? "Mark as published" : "Approve first"}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-40"
        >
          📲 Mark published
        </button>
      </div>

      {/* Source citation check */}
      <div className="bg-[#0A0E27] border border-white/10 rounded-xl p-3 text-[11px] text-[#B8C5E0]">
        <span className="text-[#FFD700] font-semibold">Source:</span>{" "}
        {script.news_item?.source_name ?? dist?.source_reference.name}
        {" · "}
        <a href={script.news_item?.source_url ?? dist?.source_reference.url}
           target="_blank" rel="noopener noreferrer"
           className="text-[#00D4FF] hover:underline break-all">
          {script.news_item?.source_url ?? dist?.source_reference.url}
        </a>
      </div>

      {/* English script */}
      <Section title="🇬🇧 English script" onCopy={() => copyToClipboard(script.english_full_script ?? "", "English script")}>
        <div className="text-[12px] text-[#B8C5E0] mb-1">
          Hook: <span className="text-white">{script.english_hook ?? "—"}</span>
        </div>
        <pre className="text-[12px] text-[#B8C5E0] whitespace-pre-wrap font-mono bg-[#0A0E27] border border-white/10 rounded-lg p-3 max-h-[20rem] overflow-y-auto">
          {script.english_full_script ?? "—"}
        </pre>
      </Section>

      {/* Telugu script */}
      {script.telugu_full_script && (
        <Section title="🇮🇳 Telugu script" onCopy={() => copyToClipboard(script.telugu_full_script ?? "", "Telugu script")}>
          <div className="text-[12px] text-[#B8C5E0] mb-1">
            Hook: <span className="text-white">{script.telugu_hook ?? "—"}</span>
          </div>
          <pre className="text-[12px] text-[#B8C5E0] whitespace-pre-wrap font-mono bg-[#0A0E27] border border-[#FFB020]/20 rounded-lg p-3 max-h-[20rem] overflow-y-auto">
            {script.telugu_full_script}
          </pre>
          <p className="text-[10px] text-[#6B7799] mt-1">
            Paste into HeyGen with your Telugu voice clone for the dubbed video.
          </p>
        </Section>
      )}

      {/* Thumbnails */}
      <Section title={`🎨 Thumbnail prompts (${script.thumbnail_prompts?.length ?? 0})`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(script.thumbnail_prompts ?? []).map((t, i) => (
            <div key={i} className="bg-[#0A0E27] border border-white/10 rounded-xl p-3 text-[12px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#00D4FF]">
                  {t.style}
                </span>
                <button
                  onClick={() => copyToClipboard(t.prompt, `${t.style} prompt`)}
                  className="text-[10px] text-[#00D4FF] hover:underline"
                >
                  Copy
                </button>
              </div>
              <div className="font-bold text-white text-[14px]">{t.headline}</div>
              <div className="text-[11px] text-[#B8C5E0] line-clamp-6">{t.prompt}</div>
              <div className="text-[10px] text-[#FFB020] font-semibold border-t border-white/10 pt-2">
                Badge: {t.source_badge}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Distribution — English */}
      {renderDistribution(dist, "📦 English distribution", "border-white/10")}

      {/* Distribution — Telugu (only show empty state if a Telugu script
          exists; otherwise the slot is irrelevant). */}
      {(script.telugu_full_script || distTe) &&
        renderDistribution(distTe, "📦 Telugu distribution", "border-[#FFB020]/30")}

      {/* 🎬 Scenes — English */}
      <Section title="🎬 English Scenes">
        {script.scenes && script.scenes.scenes?.length ? (
          <div className="space-y-3">
            <div className="text-[10px] text-[#6B7799]">
              {script.scenes.scene_count} scenes · ~{script.scenes.total_duration_sec}s
              {script.scenes_generated_at && (
                <> · generated {new Date(script.scenes_generated_at).toLocaleString()}</>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {script.scenes.scenes.map((s) => (
                <SceneTile key={s.scene_id} s={s} />
              ))}
            </div>
            <VoiceoverMusicBlock
              voiceover={script.scenes.voiceover}
              music={script.scenes.music}
            />
          </div>
        ) : (
          <div className="text-[11px] text-[#6B7799] border border-dashed border-[#9D7DFF]/30 rounded-lg p-3">
            No English scenes yet — click <span className="text-[#9D7DFF] font-semibold">✨ Generate EN scenes</span> in the toolbar above.
            Per-vertical visual accent ({script.vertical}) is baked into every scene.
          </div>
        )}
      </Section>

      {/* 🎬 Scenes — Telugu (same cast + visual style, Telugu spoken_text) */}
      <Section title="🎬 Telugu Scenes">
        {script.scenesTe && script.scenesTe.scenes?.length ? (
          <div className="space-y-3">
            <div className="text-[10px] text-[#6B7799]">
              {script.scenesTe.scene_count} scenes · ~{script.scenesTe.total_duration_sec}s
              {script.scenesTeGeneratedAt && (
                <> · generated {new Date(script.scenesTeGeneratedAt).toLocaleString()}</>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {script.scenesTe.scenes.map((s) => (
                <SceneTile key={s.scene_id} s={s} />
              ))}
            </div>
            <VoiceoverMusicBlock
              voiceover={script.scenesTe.voiceover}
              music={script.scenesTe.music}
            />
          </div>
        ) : (
          <div className="text-[11px] text-[#6B7799] border border-dashed border-[#FFB020]/30 rounded-lg p-3">
            No Telugu scenes yet — click <span className="text-[#FFB020] font-semibold">✨ Generate TE scenes</span> above.
            {!script.telugu_full_script && " (Needs a Telugu script first.)"}
          </div>
        )}
      </Section>

      {script.approval_status === "rejected" && script.rejection_reason && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-[12px] text-red-300">
          Rejected: {script.rejection_reason}
        </div>
      )}
      {script.approval_status === "published" && (
        <div className="bg-[#00F5A0]/10 border border-[#00F5A0]/30 rounded-xl p-3 text-[12px] text-[#00F5A0] space-y-1">
          <div>✓ Published {script.published_at ? new Date(script.published_at).toLocaleString() : ""}</div>
          {script.english_video_url && <div>EN: <a className="underline" href={script.english_video_url} target="_blank" rel="noopener noreferrer">{script.english_video_url}</a></div>}
          {script.telugu_video_url && <div>TE: <a className="underline" href={script.telugu_video_url} target="_blank" rel="noopener noreferrer">{script.telugu_video_url}</a></div>}
        </div>
      )}
    </div>
  );
}

// ── Learnings tab — memories + postmortems + manual sweep triggers ─────
function LearningsPanel({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [vertical, setVertical] = useState<string>("");
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [postmortems, setPostmortems] = useState<Postmortem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openPmId, setOpenPmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = vertical ? `?vertical=${vertical}` : "";
      const [m, p] = await Promise.all([
        api<Memory[]>(token, `/memories${qs}`),
        api<Postmortem[]>(token, `/postmortems${qs}`),
      ]);
      setMemories(m);
      setPostmortems(p);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }, [token, vertical, onToast]);

  useEffect(() => { void load(); }, [load]);

  async function runSweep(kind: "metrics" | "postmortem" | "improvement") {
    setBusy(kind);
    try {
      const r = await api<unknown>(token, `/intelligence/${kind}-sweep`, { method: "POST" });
      onToast(`✓ ${kind}-sweep done: ${summariseSweep(kind, r)}`);
      await load();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  // Group memories by vertical → memory_type for display.
  const memoriesByVerticalType = (memories ?? []).reduce<
    Record<string, Record<string, Memory[]>>
  >((acc, m) => {
    (acc[m.vertical] ??= {})[m.memory_type] ??= [];
    acc[m.vertical][m.memory_type].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Manual sweep triggers + filter */}
      <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold">🧠 Learning loop</div>
            <div className="text-[11px] text-[#6B7799]">
              metrics hourly · postmortem 04:30 UTC · improvement 06:00 UTC. Manual triggers below.
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => runSweep("metrics")}
              disabled={busy !== null}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00D4FF]/15 border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/25 disabled:opacity-40"
            >
              {busy === "metrics" ? "…" : "📊 Run metrics"}
            </button>
            <button
              onClick={() => runSweep("postmortem")}
              disabled={busy !== null}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FFB020]/15 border border-[#FFB020]/40 text-[#FFB020] hover:bg-[#FFB020]/25 disabled:opacity-40"
            >
              {busy === "postmortem" ? "…" : "📝 Run postmortems"}
            </button>
            <button
              onClick={() => runSweep("improvement")}
              disabled={busy !== null}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00F5A0]/15 border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/25 disabled:opacity-40"
            >
              {busy === "improvement" ? "…" : "🚀 Run improvement"}
            </button>
          </div>
        </div>
        <select
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          className="bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm w-full max-w-xs"
        >
          <option value="">All verticals</option>
          {Object.entries(VERTICAL_LABELS).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </div>

      {/* Active memories */}
      <div className="bg-[#151B3D] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">🧠 Active memories</div>
            <div className="text-[10px] text-[#6B7799] uppercase tracking-wide">
              {memories ? `${memories.length} promoted` : "Loading…"}
            </div>
          </div>
        </div>
        {!memories ? <Loading /> : memories.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#6B7799]">
            <div className="text-3xl mb-2">⏳</div>
            <p className="font-semibold text-white mb-1">No memories yet</p>
            <p className="text-[11px] max-w-md mx-auto">
              The improvement loop promotes patterns once a vertical has ≥3 shorts with metrics
              AND at least one short hits 1.5× the vertical&apos;s mean views.
              Publish 5-10 shorts + wait ~1 week.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {Object.entries(memoriesByVerticalType).map(([v, byType]) => (
              <div key={v} className="px-4 py-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#00D4FF]">
                  {VERTICAL_LABELS[v as AiPulseVertical] ?? v}
                </div>
                {(Object.keys(byType) as MemoryType[]).map((type) => (
                  <div key={type} className="space-y-1">
                    <div className="text-[10px] font-semibold text-[#FFB020] uppercase tracking-wide">
                      {MEMORY_TYPE_EMOJI[type]} {MEMORY_TYPE_LABELS[type]}
                    </div>
                    {byType[type].map((m) => (
                      <div key={m.id} className="bg-[#0A0E27] border border-white/10 rounded-lg p-2.5 text-[12px] text-[#B8C5E0]">
                        {m.content}
                        {m.evidence?.length > 0 && (
                          <div className="mt-1 text-[10px] text-[#6B7799]">
                            Evidence: {m.evidence.length} winning script(s)
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Postmortems */}
      <div className="bg-[#151B3D] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-sm font-bold">📝 Recent postmortems</div>
          <div className="text-[10px] text-[#6B7799] uppercase tracking-wide">
            {postmortems ? `${postmortems.length} written` : "Loading…"}
          </div>
        </div>
        {!postmortems ? <Loading /> : postmortems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#6B7799]">
            <div className="text-3xl mb-2">⏳</div>
            <p className="font-semibold text-white mb-1">No postmortems yet</p>
            <p className="text-[11px] max-w-md mx-auto">
              Postmortems are written for shorts that have been published for at least 3 days
              and have metric snapshots in the DB. Publish some shorts and wait.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {postmortems.map((pm) => (
              <div key={pm.id} className="px-4 py-3 space-y-2">
                <button
                  onClick={() => setOpenPmId(openPmId === pm.id ? null : pm.id)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[#00D4FF]">
                      {VERTICAL_LABELS[pm.vertical] ?? pm.vertical}
                    </div>
                    <div className="text-[10px] text-[#6B7799]">
                      {new Date(pm.created_at).toLocaleString()}
                      {pm.content.topicSignal && <> · {pm.content.topicSignal}</>}
                    </div>
                  </div>
                  <span className="text-xs text-[#6B7799]">{openPmId === pm.id ? "▾" : "▸"}</span>
                </button>
                {openPmId === pm.id && (
                  <div className="space-y-2 text-[12px] text-[#B8C5E0] bg-[#0A0E27] border border-white/10 rounded-lg p-3">
                    {(pm.content.worked ?? []).length > 0 && (
                      <PmList label="✅ Worked" items={pm.content.worked ?? []} />
                    )}
                    {(pm.content.didntWork ?? []).length > 0 && (
                      <PmList label="❌ Didn't work" items={pm.content.didntWork ?? []} />
                    )}
                    {(pm.content.next ?? []).length > 0 && (
                      <PmList label="➡ Try next" items={pm.content.next ?? []} />
                    )}
                    {pm.content.reusableHookPattern && (
                      <div>
                        <span className="text-[#FFB020] font-semibold">🎯 Hook pattern:</span>{" "}
                        {pm.content.reusableHookPattern}
                      </div>
                    )}
                    {pm.content.winningThumbnailStyle && pm.content.winningThumbnailStyle !== "none" && (
                      <div>
                        <span className="text-[#FFB020] font-semibold">🎨 Thumbnail style:</span>{" "}
                        {pm.content.winningThumbnailStyle}
                      </div>
                    )}
                    {(pm.content.winningHashtags ?? []).length > 0 && (
                      <div>
                        <span className="text-[#FFB020] font-semibold">#️⃣ Hashtags:</span>{" "}
                        {(pm.content.winningHashtags ?? []).join(" ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PmList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-[#B8C5E0] uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <ul className="list-disc list-inside space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function summariseSweep(kind: string, r: unknown): string {
  const obj = (r ?? {}) as Record<string, unknown>;
  if (kind === "metrics") return `${obj.saved ?? 0} snapshots / ${obj.scanned ?? 0} shorts`;
  if (kind === "postmortem") return `${obj.generated ?? 0}/${obj.scanned ?? 0} written`;
  if (kind === "improvement") {
    return `${obj.winners ?? 0} winner(s), ${obj.promoted ?? 0} memory(ies) promoted`;
  }
  return JSON.stringify(obj).slice(0, 80);
}

// ── Small UI primitives ─────────────────────────────────────────────────
function Section({ title, onCopy, children }: { title: string; onCopy?: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#B8C5E0]">{title}</h3>
        {onCopy && (
          <button onClick={onCopy} className="text-[10px] font-semibold text-[#00D4FF] hover:underline">
            Copy
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function PlatformBlock({ title, onCopy, children }: { title: string; onCopy?: (v: string) => void; children: React.ReactNode }) {
  void onCopy;
  return (
    <div className="bg-[#0A0E27] border border-white/10 rounded-xl p-3 space-y-2">
      <div className="text-[11px] font-bold text-[#00D4FF]">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-[#6B7799] uppercase tracking-wide mb-0.5">{label}</div>
      {multiline ? (
        <pre className="text-[12px] text-[#B8C5E0] whitespace-pre-wrap font-mono bg-[#151B3D] border border-white/10 rounded-lg p-2 max-h-40 overflow-y-auto">
          {value || "—"}
        </pre>
      ) : (
        <div className="text-[12px] text-white">{value || "—"}</div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" />
    </div>
  );
}

// ── Scene UI (parallel to AQB; blueprint format) ──────────────────────────

function SceneTile({ s }: { s: AiPulseScene }) {
  const [copied, setCopied] = useState<"none" | "json">("none");
  async function copyJson() {
    const obj = {
      scene_id:            s.scene_id,
      duration_seconds:    s.duration_seconds,
      spoken_text:         s.spoken_text,
      setting:             s.setting,
      subject:             s.subject,
      shot:                s.shot,
      lighting:            s.lighting,
      mood:                s.mood,
      style:               s.style,
      character_dna:       s.character_dna,
      reference_image_url: s.reference_image_url ?? null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      setCopied("json");
      setTimeout(() => setCopied("none"), 1200);
    } catch {/* ignore */}
  }

  return (
    <div className="bg-[#0A0E27] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[#9D7DFF] tracking-wide">
          Scene {s.scene_id} · {s.duration_seconds}s · {s.mood || "—"}
        </span>
        <button
          onClick={copyJson}
          className="text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-[#B8C5E0] hover:bg-white/5"
        >
          {copied === "json" ? "✓ Copied JSON" : "📋 Copy JSON"}
        </button>
      </div>

      {s.spoken_text && (
        <div className="px-3 py-2 border-b border-white/5 bg-[#0F1330]">
          <span className="text-[9px] text-[#6B7799] uppercase tracking-wide">Spoken</span>
          <p className="text-[12px] text-white mt-0.5 italic">&ldquo;{s.spoken_text}&rdquo;</p>
        </div>
      )}

      <div className="px-3 py-2 space-y-1.5 text-[11px] text-[#B8C5E0]">
        <SceneField label="Setting"  value={s.setting} />
        <SceneField label="Subject"  value={s.subject} />
        <SceneField label="Shot"     value={s.shot} />
        <SceneField label="Lighting" value={s.lighting} />
        {s.reference_image_url && (
          <SceneField label="Reference image" value={s.reference_image_url} mono />
        )}
      </div>

      <details className="px-3 py-2 border-t border-white/5 text-[10px] text-[#6B7799]">
        <summary className="cursor-pointer hover:text-[#B8C5E0]">Style + character DNA (inlined every scene)</summary>
        <div className="mt-1.5 space-y-1.5">
          <SceneField label="Style"         value={s.style} />
          <SceneField label="Character DNA" value={s.character_dna} />
        </div>
      </details>
    </div>
  );
}

function SceneField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-[9px] text-[#6B7799] uppercase tracking-wide shrink-0 w-[78px] pt-[2px]">
        {label}
      </span>
      <span className={"flex-1 break-words " + (mono ? "font-mono text-[10px] text-[#9D7DFF]" : "")}>
        {value}
      </span>
    </div>
  );
}

function VoiceoverMusicBlock({
  voiceover, music,
}: { voiceover: AiPulseVoiceoverSpec; music: AiPulseMusicSpec }) {
  const [copied, setCopied] = useState<"none" | "vo" | "music">("none");
  async function copy(kind: "vo" | "music", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied("none"), 1200);
    } catch {/* ignore */}
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/5">
      <div className="bg-[#0A0E27] border border-[#FFB020]/20 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#FFB020] uppercase tracking-wide">
            🎙️ Voiceover · paste into MiniMax / ElevenLabs
          </span>
          <button
            onClick={() => copy("vo", voiceover?.full_text ?? "")}
            disabled={!voiceover?.full_text}
            className="text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-40"
          >
            {copied === "vo" ? "✓ Copied" : "📋 Copy VO"}
          </button>
        </div>
        <SceneField label="Voice"  value={voiceover?.voice_style ?? ""} />
        <SceneField label="Pacing" value={voiceover?.pacing_notes ?? ""} />
        <pre className="text-[11px] text-[#B8C5E0] whitespace-pre-wrap font-mono leading-relaxed bg-[#0F1330] rounded-md p-2 max-h-[10rem] overflow-y-auto">
          {voiceover?.full_text ?? "(no voiceover generated)"}
        </pre>
      </div>

      <div className="bg-[#0A0E27] border border-[#9D7DFF]/20 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#9D7DFF] uppercase tracking-wide">
            🎵 Music · paste into Lyria / Suno / MiniMax
          </span>
          <button
            onClick={() => copy("music", music?.minimax_prompt ?? "")}
            disabled={!music?.minimax_prompt}
            className="text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-40"
          >
            {copied === "music" ? "✓ Copied" : "📋 Copy music prompt"}
          </button>
        </div>
        <SceneField label="Style" value={music?.style ?? ""} />
        <SceneField label="Tempo" value={music?.tempo ?? ""} />
        <SceneField label="Mood"  value={music?.mood ?? ""} />
        <pre className="text-[11px] text-[#B8C5E0] whitespace-pre-wrap font-mono leading-relaxed bg-[#0F1330] rounded-md p-2 max-h-[10rem] overflow-y-auto">
          {music?.minimax_prompt ?? "(no music prompt generated)"}
        </pre>
      </div>
    </div>
  );
}
