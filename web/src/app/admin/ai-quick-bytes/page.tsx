"use client";

// AI Quick Bytes — admin dashboard. API is at /api/v1/admin/ai-quick-bytes
// (behind AdminGuard). Auth handled by the /admin layout's Better Auth check.

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchToken, api, STATUS_COLOR,
  type NewsItem, type ShortScript, type NewsSourceRow, type DailyStats,
  type DistributionResp, type ThumbnailPromptResp,
} from "./_helpers";

type Tab = "pipeline" | "news" | "approval";

export default function AiQuickBytesPage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">⚡ AI Quick Bytes</h1>
        <p className="text-[#6B7799] text-sm mt-1">
          AI news → score → YouTube Shorts scripts → HeyGen → manual publish
        </p>
      </div>

      {toast && (
        <div className="bg-[#00F5A0]/10 border border-[#00F5A0]/30 rounded-xl p-3 text-[#00F5A0] text-sm">
          {toast}
        </div>
      )}

      <div className="flex gap-2 border-b border-white/10">
        {(["pipeline", "news", "approval"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition border-b-2 ${
              tab === t
                ? "border-[#00D4FF] text-white"
                : "border-transparent text-[#6B7799] hover:text-[#B8C5E0]"
            }`}
          >
            {t === "approval" ? "Approval Queue" : t}
          </button>
        ))}
      </div>

      {tab === "pipeline" && <PipelineTab onToast={setToast} />}
      {tab === "news" && <NewsTab />}
      {tab === "approval" && <ApprovalTab onToast={setToast} />}
    </div>
  );
}

// ── Pipeline tab ──────────────────────────────────────────────────────────────

function PipelineTab({ onToast }: { onToast: (m: string) => void }) {
  const [sources, setSources] = useState<NewsSourceRow[]>([]);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await fetchToken();
    if (!token) return;
    try {
      const [s, st] = await Promise.all([
        api<NewsSourceRow[]>(token, "/sources"),
        api<DailyStats>(token, "/approval/stats/daily"),
      ]);
      setSources(s);
      setStats(st);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    }
  }, [onToast]);

  useEffect(() => { void load(); }, [load]);

  async function trigger(label: string, path: string) {
    setBusy(label);
    const token = await fetchToken();
    if (!token) { setBusy(null); return; }
    try {
      await api(token, path, { method: "POST" });
      onToast(`✓ ${label} queued`);
      setTimeout(load, 1500);
    } catch (e) {
      onToast(`⚠ ${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Stat label="Published today" value={stats ? String(stats.publishedToday) : "—"} />
        <Stat
          label="LLM cost today"
          value={stats ? `$${stats.llmCostToday.toFixed(4)}` : "—"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <PipelineBtn
          label="① Fetch News"
          busy={busy === "Fetch News"}
          onClick={() => trigger("Fetch News", "/ingestion/run")}
        />
        <PipelineBtn
          label="② Score Pending"
          busy={busy === "Score Pending"}
          onClick={() => trigger("Score Pending", "/scoring/run-pending?limit=50")}
        />
        <PipelineBtn
          label="③ Generate Top 3 Scripts"
          busy={busy === "Generate Scripts"}
          onClick={() => trigger("Generate Scripts", "/scripts/generate-top?limit=3")}
        />
      </div>

      <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 text-white text-sm font-semibold">
          Sources ({sources.length})
        </div>
        <table className="w-full text-sm">
          <thead className="text-[#6B7799] text-xs">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Last fetched</th>
              <th className="text-left px-4 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-white/5">
                <td className="px-4 py-2 text-[#B8C5E0]">{s.name}</td>
                <td className="px-4 py-2 text-[#6B7799]">{s.sourceType}</td>
                <td className="px-4 py-2 text-[#6B7799]">
                  {s.lastFetchedAt ? new Date(s.lastFetchedAt).toLocaleString() : "never"}
                </td>
                <td className="px-4 py-2">
                  {s.errorCount > 0 ? (
                    <span className="text-[#FF5C7C]" title={s.lastError ?? ""}>
                      {s.errorCount}
                    </span>
                  ) : (
                    <span className="text-[#6B7799]">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-xl p-4">
      <div className="text-[#6B7799] text-xs">{label}</div>
      <div className="text-white text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function PipelineBtn({ label, onClick, busy }: {
  label: string; onClick: () => void; busy: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-4 py-2 text-sm font-semibold rounded-xl border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-50 transition"
    >
      {busy ? "Working…" : label}
    </button>
  );
}

// ── News tab ──────────────────────────────────────────────────────────────────

function NewsTab() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (status) params.set("status", status);
      if (since) params.set("since", since);
      if (until) params.set("until", until);
      const res = await api<{ data: NewsItem[] }>(token, `/news?${params}`);
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  }, [status, since, until]);

  useEffect(() => { void load(); }, [load]);

  function quickRange(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setSince(d.toISOString().slice(0, 10));
    setUntil("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
        >
          <option value="">All statuses</option>
          {["raw", "scored", "scripted", "published", "rejected"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label className="text-xs text-[#6B7799]">From</label>
        <input
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"
        />
        <label className="text-xs text-[#6B7799]">To</label>
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"
        />

        <button
          onClick={() => quickRange(1)}
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-white/10 text-[#B8C5E0] hover:bg-white/5"
        >
          Last 24h
        </button>
        <button
          onClick={() => quickRange(7)}
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-white/10 text-[#B8C5E0] hover:bg-white/5"
        >
          Last 7d
        </button>
        {(since || until) && (
          <button
            onClick={() => { setSince(""); setUntil(""); }}
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-[#FF5C7C]/40 text-[#FF5C7C] hover:bg-[#FF5C7C]/10"
          >
            Clear dates
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-[#6B7799] text-sm p-8 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
          No news items. Run “Fetch News” on the Pipeline tab.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className="bg-[#151B3D] border border-white/10 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B8C5E0] text-sm font-medium hover:text-[#00D4FF]"
                >
                  {n.title}
                </a>
                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[n.status] ?? ""}`}>
                  {n.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-[#6B7799]">
                <span>{n.source?.name ?? "—"}</span>
                {n.score && (
                  <span className="text-[#00D4FF]">
                    score {n.score.compositeScore} (I{n.score.importanceScore}/N
                    {n.score.noveltyScore}/V{n.score.viralPotential})
                  </span>
                )}
                {n.publishedAt && <span>{new Date(n.publishedAt).toLocaleDateString()}</span>}
              </div>
              {n.score?.reasoning && (
                <p className="text-[#6B7799] text-xs mt-2 italic">{n.score.reasoning}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Approval tab ──────────────────────────────────────────────────────────────

function ApprovalTab({ onToast }: { onToast: (m: string) => void }) {
  const [scripts, setScripts] = useState<ShortScript[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const data = await api<ShortScript[]>(token, "/approval/queue");
      setScripts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, label: string, fn: (token: string) => Promise<unknown>) {
    const token = await fetchToken();
    if (!token) return;
    try {
      await fn(token);
      onToast(`✓ ${label}`);
      await load();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    }
  }

  if (loading) return <div className="text-[#6B7799] text-sm p-8 text-center">Loading…</div>;
  if (scripts.length === 0) {
    return (
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
        No draft scripts. Generate some on the Pipeline tab.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scripts.map((s) => (
        <ScriptCard key={s.id} script={s} onAct={act} />
      ))}
    </div>
  );
}

function ScriptCard({ script, onAct }: {
  script: ShortScript;
  onAct: (id: string, label: string, fn: (token: string) => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [hook, setHook] = useState(script.hook);
  const [body, setBody] = useState(script.body);
  const [cta, setCta] = useState(script.cta);
  const [showDist, setShowDist] = useState(false);
  const [dist, setDist] = useState<DistributionResp | null>(null);
  const [thumb, setThumb] = useState<ThumbnailPromptResp | null>(null);
  const [distBusy, setDistBusy] = useState(false);

  async function loadDist() {
    setDistBusy(true);
    const token = await fetchToken();
    if (!token) { setDistBusy(false); return; }
    try {
      const [d, t] = await Promise.all([
        api<DistributionResp>(token, `/approval/${script.id}/distribution`),
        api<ThumbnailPromptResp>(token, `/approval/${script.id}/thumbnail`),
      ]);
      setDist(d);
      setThumb(t);
    } finally {
      setDistBusy(false);
    }
  }

  function toggleDist() {
    const next = !showDist;
    setShowDist(next);
    if (next && !dist) void loadDist();
  }

  async function regenerateDist() {
    setDistBusy(true);
    const token = await fetchToken();
    if (!token) { setDistBusy(false); return; }
    try {
      // Regenerate both the thumbnail prompt and the distribution package.
      await api(token, `/approval/${script.id}/thumbnail/regenerate`, { method: "POST" });
      await api(token, `/approval/${script.id}/distribution/regenerate`, { method: "POST" });
      await loadDist();
    } finally {
      setDistBusy(false);
    }
  }

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <span className="text-[#B8C5E0] text-sm font-medium truncate">
          {script.newsItem?.title ?? "—"}
        </span>
        <span className="text-[#6B7799] text-xs whitespace-nowrap">
          {script.avatarId ?? "?"} · {script.durationEstimateSeconds ?? "?"}s · BV
          {script.brandVoiceScore ?? "?"}
        </span>
      </div>

      {editing ? (
        <div className="p-4 space-y-2">
          {[["Hook", hook, setHook], ["Body", body, setBody], ["CTA", cta, setCta]].map(
            ([label, val, set]) => (
              <div key={label as string}>
                <label className="text-[10px] text-[#6B7799] uppercase">{label as string}</label>
                <textarea
                  value={val as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  rows={label === "Body" ? 4 : 2}
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#B8C5E0] font-mono"
                />
              </div>
            ),
          )}
        </div>
      ) : (
        <pre className="px-4 py-3 text-[13px] text-[#B8C5E0] whitespace-pre-wrap font-mono leading-relaxed">
          {script.fullScript}
        </pre>
      )}

      <div className="px-4 py-3 border-t border-white/5 flex flex-wrap gap-2">
        {editing ? (
          <>
            <Btn
              label="💾 Save"
              accent="#00D4FF"
              onClick={() =>
                onAct(script.id, "Saved", (t) =>
                  api(t, `/approval/${script.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ hook, body, cta }),
                  }),
                ).then(() => setEditing(false))
              }
            />
            <Btn label="Cancel" onClick={() => setEditing(false)} />
          </>
        ) : (
          <>
            <Btn label="✏️ Edit" onClick={() => setEditing(true)} />
            <Btn
              label="✅ Approve"
              accent="#00F5A0"
              onClick={() =>
                onAct(script.id, "Approved", (t) =>
                  api(t, `/approval/${script.id}/approve`, { method: "POST" }),
                )
              }
            />
            <Btn
              label="❌ Reject"
              accent="#FF5C7C"
              onClick={() => {
                const reason = prompt("Rejection reason?") ?? "";
                if (reason === "") return;
                void onAct(script.id, "Rejected", (t) =>
                  api(t, `/approval/${script.id}/reject`, {
                    method: "POST",
                    body: JSON.stringify({ reason }),
                  }),
                );
              }}
            />
            <Btn
              label="📲 Mark Published"
              onClick={() => {
                const url = prompt("Published YouTube URL?") ?? "";
                if (!url) return;
                void onAct(script.id, "Marked published", (t) =>
                  api(t, `/approval/${script.id}/mark-published`, {
                    method: "POST",
                    body: JSON.stringify({ platform: "youtube", url }),
                  }),
                );
              }}
            />
            <Btn
              label={showDist ? "📦 Hide Distribution" : "📦 Distribution"}
              accent="#FFB020"
              onClick={toggleDist}
            />
          </>
        )}
      </div>

      {showDist && (
        <div className="px-4 py-4 border-t border-white/5 space-y-4 bg-[#0F1330]">
          {distBusy && !dist ? (
            <p className="text-[#6B7799] text-sm">Loading distribution package…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[#B8C5E0] text-xs font-semibold uppercase tracking-wide">
                  Day {dist?.dayNumber ?? thumb?.dayNumber ?? "—"} · copy & post
                </span>
                <button
                  onClick={regenerateDist}
                  disabled={distBusy}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-50"
                >
                  {distBusy ? "Regenerating…" : "🔄 Regenerate all"}
                </button>
              </div>

              {/* Thumbnail prompt */}
              {thumb?.thumbnailPrompt ? (
                <Block title="🖼 Thumbnail prompt (paste into ChatGPT/DALL-E)">
                  <CopyField label="Overlay text" value={thumb.thumbnailPrompt.overlayText} />
                  <CopyField label="Image prompt" value={thumb.thumbnailPrompt.prompt} multiline />
                </Block>
              ) : (
                <p className="text-[#6B7799] text-xs">No thumbnail prompt generated yet.</p>
              )}

              {/* Distribution posts */}
              {dist?.package ? (
                <>
                  <Block title="▶️ YouTube">
                    <CopyField label="Title" value={dist.package.youtube?.title ?? ""} />
                    <CopyField label="Description" value={dist.package.youtube?.description ?? ""} multiline />
                    <CopyField label="Tags" value={(dist.package.youtube?.tags ?? []).join(", ")} />
                  </Block>
                  <Block title="📸 Instagram">
                    <CopyField label="Caption + hashtags" value={dist.package.instagram?.full_text ?? ""} multiline />
                  </Block>
                  <Block title="💼 LinkedIn">
                    <CopyField label="Post" value={dist.package.linkedin?.full_text ?? ""} multiline />
                  </Block>
                  <Block title="💬 WhatsApp Channel">
                    <CopyField label="Message" value={dist.package.whatsapp_channel?.full_text ?? ""} multiline />
                  </Block>
                  <Block title="📱 WhatsApp Status">
                    <CopyField label="Status" value={dist.package.whatsapp_status?.full_text ?? ""} multiline />
                  </Block>
                  {dist.package.source_reference && (
                    <p className="text-[10px] text-[#6B7799]">
                      Source: {dist.package.source_reference.source_name} ·{" "}
                      <a href={dist.package.source_reference.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#00D4FF]">
                        {dist.package.source_reference.url}
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[#6B7799] text-xs">
                  No distribution package yet. Click 🔄 Regenerate to create one.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-white/5 text-[#B8C5E0] text-xs font-semibold">{title}</div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  );
}

function CopyField({ label, value, multiline }: {
  label: string; value: string; multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[#6B7799] uppercase">{label}</span>
        <button
          onClick={copy}
          disabled={!value}
          className="text-[10px] font-semibold text-[#00D4FF] hover:underline disabled:opacity-40"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className={`bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#B8C5E0] whitespace-pre-wrap font-mono ${multiline ? "" : "truncate"}`}>
        {value || "—"}
      </pre>
    </div>
  );
}

function Btn({ label, onClick, accent }: {
  label: string; onClick: () => void; accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:text-white hover:bg-white/5 transition"
      style={accent ? { color: accent, borderColor: `${accent}40` } : undefined}
    >
      {label}
    </button>
  );
}
