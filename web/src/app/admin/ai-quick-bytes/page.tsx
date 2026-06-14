"use client";

// AI Quick Bytes — admin dashboard. API is at /api/v1/admin/ai-quick-bytes
// (behind AdminGuard). Auth handled by the /admin layout's Better Auth check.

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchToken, api, STATUS_COLOR,
  type NewsItem, type ShortScript, type NewsSourceRow, type DailyStats,
  type DistributionResp, type ThumbnailPromptResp, type ThumbnailVariation,
  type TeluguResp,
  type AqbMemoryRow, type AqbPostmortemRow,
} from "./_helpers";

type Tab = "pipeline" | "news" | "approval" | "learnings";

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
        {(["pipeline", "news", "approval", "learnings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition border-b-2 ${
              tab === t
                ? "border-[#00D4FF] text-white"
                : "border-transparent text-[#6B7799] hover:text-[#B8C5E0]"
            }`}
          >
            {t === "approval" ? "Approval Queue" : t === "learnings" ? "🧠 Learnings" : t}
          </button>
        ))}
      </div>

      {tab === "pipeline" && <PipelineTab onToast={setToast} />}
      {tab === "news" && <NewsTab />}
      {tab === "approval" && <ApprovalTab onToast={setToast} />}
      {tab === "learnings" && <LearningsTab onToast={setToast} />}
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

const SCRIPT_STATUSES = [
  "draft", "approved", "generating", "ready", "published", "rejected", "failed",
] as const;

function ApprovalTab({ onToast }: { onToast: (m: string) => void }) {
  const [scripts, setScripts] = useState<ShortScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("draft");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      if (status === "draft") {
        // /approval/queue keeps news-score ordering for the review queue.
        const data = await api<ShortScript[]>(token, "/approval/queue");
        setScripts(data);
      } else {
        const res = await api<{ data: ShortScript[] }>(
          token,
          `/scripts?status=${status}&limit=100`,
        );
        setScripts(res.data);
      }
    } finally {
      setLoading(false);
    }
  }, [status]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[#6B7799] text-xs">Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
        >
          {SCRIPT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="ml-auto text-[#6B7799] text-xs">
          {scripts.length} script{scripts.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="text-[#6B7799] text-sm p-8 text-center">Loading…</div>
      ) : scripts.length === 0 ? (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
          No {status} scripts.
          {status === "draft" && " Generate some on the Pipeline tab."}
        </div>
      ) : (
        scripts.map((s) => (
          <ScriptCard key={s.id} script={s} onAct={act} />
        ))
      )}
    </div>
  );
}

const DISTRIBUTION_PLATFORMS = [
  { key: "youtube",          label: "YouTube",          short: "YT" },
  { key: "instagram",        label: "Instagram",        short: "IG" },
  { key: "linkedin",         label: "LinkedIn",         short: "LI" },
  { key: "whatsapp_channel", label: "WhatsApp Channel", short: "WA" },
  { key: "whatsapp_status",  label: "WhatsApp Status",  short: "WS" },
] as const;
type DistPlatform = (typeof DISTRIBUTION_PLATFORMS)[number]["key"];

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
  const [showTelugu, setShowTelugu] = useState(false);
  const [telugu, setTelugu] = useState<TeluguResp | null>(null);
  const [teluguBusy, setTeluguBusy] = useState(false);
  // Default to all platforms selected — preserves the old "🔄 Regenerate all" behavior.
  const [enPlatforms, setEnPlatforms] = useState<DistPlatform[]>(
    DISTRIBUTION_PLATFORMS.map((p) => p.key),
  );
  const [tePlatforms, setTePlatforms] = useState<DistPlatform[]>(
    DISTRIBUTION_PLATFORMS.map((p) => p.key),
  );
  const allEnSelected = enPlatforms.length === DISTRIBUTION_PLATFORMS.length;
  const allTeSelected = tePlatforms.length === DISTRIBUTION_PLATFORMS.length;

  function toggleEnPlatform(key: DistPlatform) {
    setEnPlatforms((cur) =>
      cur.includes(key) ? cur.filter((p) => p !== key) : [...cur, key],
    );
  }
  function toggleTePlatform(key: DistPlatform) {
    setTePlatforms((cur) =>
      cur.includes(key) ? cur.filter((p) => p !== key) : [...cur, key],
    );
  }

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
    if (enPlatforms.length === 0) {
      alert("Pick at least one platform to regenerate.");
      return;
    }
    setDistBusy(true);
    const token = await fetchToken();
    if (!token) { setDistBusy(false); return; }
    try {
      // Thumbnail regenerates only when the platform set is "all" — partial
      // platform refreshes shouldn't churn a fine thumbnail. Curators who
      // want a new thumbnail can hit "Regenerate all" or use a dedicated
      // thumbnail-only path.
      if (allEnSelected) {
        await api(token, `/approval/${script.id}/thumbnail/regenerate`, { method: "POST" });
      }
      await api(token, `/approval/${script.id}/distribution/regenerate`, {
        method: "POST",
        body: JSON.stringify({ platforms: enPlatforms }),
      });
      await loadDist();
    } finally {
      setDistBusy(false);
    }
  }

  async function loadTelugu() {
    setTeluguBusy(true);
    const token = await fetchToken();
    if (!token) { setTeluguBusy(false); return; }
    try {
      const t = await api<TeluguResp>(token, `/approval/${script.id}/telugu`);
      setTelugu(t);
    } finally { setTeluguBusy(false); }
  }

  function toggleTelugu() {
    const next = !showTelugu;
    setShowTelugu(next);
    if (next && !telugu) void loadTelugu();
  }

  async function regenerateTeluguTranslation() {
    setTeluguBusy(true);
    const token = await fetchToken();
    if (!token) { setTeluguBusy(false); return; }
    try {
      await api(token, `/approval/${script.id}/telugu/regenerate-translation`, { method: "POST" });
      await loadTelugu();
    } finally { setTeluguBusy(false); }
  }

  async function regenerateTeluguDistribution() {
    if (tePlatforms.length === 0) {
      alert("Pick at least one platform to regenerate.");
      return;
    }
    setTeluguBusy(true);
    const token = await fetchToken();
    if (!token) { setTeluguBusy(false); return; }
    try {
      await api(token, `/approval/${script.id}/telugu/distribution/regenerate`, {
        method: "POST",
        body: JSON.stringify({ platforms: tePlatforms }),
      });
      await loadTelugu();
    } finally { setTeluguBusy(false); }
  }

  async function markTeluguPublished() {
    const url = prompt("Telugu YouTube URL?") ?? "";
    if (!url) return;
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/approval/${script.id}/telugu/mark-published`, {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      await loadTelugu();
    } catch (e) {
      alert(`⚠ ${(e as Error).message}`);
    }
  }

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <span className="text-[#B8C5E0] text-sm font-medium truncate flex items-center gap-2">
          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[script.status] ?? "bg-slate-500/20 text-slate-300"}`}>
            {script.status}
          </span>
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
            {script.status === "draft" && (
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
              </>
            )}
            {script.status !== "published" && script.status !== "rejected" && (
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
            )}
            <Btn label="📋 Copy script" onClick={() => navigator.clipboard.writeText(script.fullScript)} />
            <Btn
              label={showDist ? "📦 Hide Distribution" : "📦 Distribution"}
              accent="#FFB020"
              onClick={toggleDist}
            />
            <Btn
              label={showTelugu ? "🇮🇳 Hide Telugu" : "🇮🇳 Telugu"}
              accent="#FF6B6B"
              onClick={toggleTelugu}
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#B8C5E0] text-xs font-semibold uppercase tracking-wide">
                  Day {dist?.dayNumber ?? thumb?.dayNumber ?? "—"} · copy & post
                </span>
                <button
                  onClick={regenerateDist}
                  disabled={distBusy || enPlatforms.length === 0}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-50 whitespace-nowrap"
                >
                  {distBusy
                    ? "Regenerating…"
                    : allEnSelected
                      ? "🔄 Regenerate all"
                      : `🔄 Regenerate (${enPlatforms.length})`}
                </button>
              </div>

              {/* Platform picker — tap a pill to skip that platform on regen. */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {DISTRIBUTION_PLATFORMS.map((p) => {
                  const on = enPlatforms.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => toggleEnPlatform(p.key)}
                      title={on ? `Will regenerate ${p.label}` : `Will keep current ${p.label}`}
                      className={
                        "px-2.5 py-0.5 text-[10px] font-semibold rounded-full border transition " +
                        (on
                          ? "bg-[#00D4FF]/10 border-[#00D4FF]/40 text-[#00D4FF]"
                          : "bg-white/0 border-white/10 text-[#4A5470]")
                      }
                    >
                      {on ? "✓ " : ""}{p.label}
                    </button>
                  );
                })}
              </div>

              {/* Thumbnail prompts — 3 clean MrBeast-style variations */}
              {thumb?.thumbnailPrompt && "variations" in thumb.thumbnailPrompt ? (
                <Block title="🖼 Thumbnail variations (pick one, paste into ChatGPT/DALL-E)">
                  <ThumbnailVariations variations={thumb.thumbnailPrompt.variations} />
                </Block>
              ) : thumb?.thumbnailPrompt && "prompt" in thumb.thumbnailPrompt ? (
                <Block title="🖼 Thumbnail prompt (legacy — regenerate for 3 clean variations)">
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
                    {/* Live YouTube snippet — appears once metrics-fetcher has run
                        at least once on this short. Shows curator's manual edits
                        on YouTube Studio (extra hashtags, reworded title). */}
                    {dist.liveYoutube && (dist.liveYoutube.title || dist.liveYoutube.description) && (
                      <div className="mt-3 pt-3 border-t border-[#00D4FF]/15">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-[#00D4FF]">
                            🔴 Live on YouTube
                          </span>
                          {dist.liveYoutube.fetchedAt && (
                            <span className="text-[9px] text-[#6B7799]">
                              Last fetch: {new Date(dist.liveYoutube.fetchedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {dist.liveYoutube.title && (
                          <CopyField label="Live title" value={dist.liveYoutube.title} />
                        )}
                        {dist.liveYoutube.description && (
                          <CopyField
                            label="Live description"
                            value={dist.liveYoutube.description}
                            multiline
                          />
                        )}
                        {dist.liveYoutube.title && dist.package.youtube?.title &&
                         dist.liveYoutube.title.trim() !== dist.package.youtube.title.trim() && (
                          <p className="text-[10px] text-[#FFB020] mt-1">
                            ⚠ Live title differs from generated — your manual YouTube
                            Studio edits are what the learning loop now uses.
                          </p>
                        )}
                      </div>
                    )}
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

      {showTelugu && (
        <div className="px-4 py-4 border-t border-white/5 space-y-4 bg-[#0F1330]">
          {teluguBusy && !telugu ? (
            <p className="text-[#6B7799] text-sm">Loading Telugu track…</p>
          ) : telugu ? (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[#B8C5E0] text-xs font-semibold uppercase tracking-wide">
                  🇮🇳 Telugu · Day {telugu.dayNumber ?? "—"}
                  <span className="ml-2 text-[10px] font-normal text-[#6B7799]">
                    HeyGen status: {telugu.teluguHeygenStatus}
                    {telugu.teluguTranslationModel ? ` · model ${telugu.teluguTranslationModel}` : ""}
                    {` · $${Number(telugu.teluguTranslationCostUsd ?? 0).toFixed(4)}`}
                  </span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={regenerateTeluguTranslation}
                    disabled={teluguBusy}
                    className="px-3 py-1 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-50"
                  >
                    {teluguBusy ? "…" : "🔁 Regen translation"}
                  </button>
                  <button
                    onClick={regenerateTeluguDistribution}
                    disabled={teluguBusy || !telugu.teluguFullScript || tePlatforms.length === 0}
                    className="px-3 py-1 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-50 whitespace-nowrap"
                  >
                    {teluguBusy
                      ? "…"
                      : allTeSelected
                        ? "🔁 Regen Telugu posts"
                        : `🔁 Regen Telugu (${tePlatforms.length})`}
                  </button>
                  {script.status !== "rejected" && (
                    <button
                      onClick={markTeluguPublished}
                      className="px-3 py-1 text-xs font-semibold rounded-lg border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10"
                    >
                      📲 Mark Telugu Published
                    </button>
                  )}
                </div>
              </div>

              {/* Telugu platform picker — mirrors the EN section above. */}
              <div className="flex flex-wrap gap-1.5">
                {DISTRIBUTION_PLATFORMS.map((p) => {
                  const on = tePlatforms.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => toggleTePlatform(p.key)}
                      title={on ? `Will regenerate ${p.label}` : `Will keep current ${p.label}`}
                      className={
                        "px-2.5 py-0.5 text-[10px] font-semibold rounded-full border transition " +
                        (on
                          ? "bg-[#FFB020]/10 border-[#FFB020]/40 text-[#FFB020]"
                          : "bg-white/0 border-white/10 text-[#4A5470]")
                      }
                    >
                      {on ? "✓ " : ""}{p.label}
                    </button>
                  );
                })}
              </div>

              {/* Transcript */}
              {telugu.teluguFullScript ? (
                <Block title="📝 Telugu transcript">
                  <CopyField label="Hook" value={telugu.teluguHook ?? ""} multiline />
                  <CopyField label="Full script" value={telugu.teluguFullScript} multiline />
                </Block>
              ) : (
                <p className="text-[#6B7799] text-xs">
                  No Telugu translation yet — click 🔁 Regen translation.
                </p>
              )}

              {/* Video */}
              <Block title="🎬 Telugu HeyGen video">
                {telugu.teluguHeygenVideoUrl ? (
                  <div className="space-y-1.5">
                    <a
                      href={telugu.teluguHeygenVideoUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[#00D4FF] text-sm hover:underline break-all"
                    >
                      {telugu.teluguHeygenVideoUrl}
                    </a>
                    <video
                      src={telugu.teluguHeygenVideoUrl}
                      controls
                      className="w-full max-w-[260px] rounded-lg border border-white/5"
                    />
                  </div>
                ) : telugu.teluguHeygenStatus === "skipped" ? (
                  <p className="text-[#FFB020] text-xs">
                    Skipped — no HEYGEN_VOICE_*_TE_ID set for this avatar.
                    Translation is still saved; set the env var and re-approve.
                  </p>
                ) : telugu.teluguHeygenStatus === "failed" ? (
                  <p className="text-[#FF5C7C] text-xs">
                    HeyGen Telugu video failed. Re-approve to retry.
                  </p>
                ) : (
                  <p className="text-[#6B7799] text-xs">
                    {telugu.teluguHeygenStatus === "pending"
                      ? "Not queued yet — approve the script to start English + Telugu videos in parallel."
                      : `Queued (${telugu.teluguHeygenStatus}) — webhook will land here when HeyGen finishes.`}
                  </p>
                )}
              </Block>

              {/* Telugu distribution package — same 5 platforms */}
              {telugu.teluguDistributionPackage ? (
                <>
                  <Block title="▶️ YouTube (Telugu)">
                    <CopyField label="Title" value={telugu.teluguDistributionPackage.youtube?.title ?? ""} />
                    <CopyField label="Description" value={telugu.teluguDistributionPackage.youtube?.description ?? ""} multiline />
                    <CopyField label="Tags" value={(telugu.teluguDistributionPackage.youtube?.tags ?? []).join(", ")} />
                  </Block>
                  <Block title="📸 Instagram (Telugu)">
                    <CopyField label="Caption + hashtags" value={telugu.teluguDistributionPackage.instagram?.full_text ?? ""} multiline />
                  </Block>
                  <Block title="💼 LinkedIn (Telugu)">
                    <CopyField label="Post" value={telugu.teluguDistributionPackage.linkedin?.full_text ?? ""} multiline />
                  </Block>
                  <Block title="💬 WhatsApp Channel (Telugu)">
                    <CopyField label="Message" value={telugu.teluguDistributionPackage.whatsapp_channel?.full_text ?? ""} multiline />
                  </Block>
                  <Block title="📱 WhatsApp Status (Telugu)">
                    <CopyField label="Status" value={telugu.teluguDistributionPackage.whatsapp_status?.full_text ?? ""} multiline />
                  </Block>
                </>
              ) : (
                <p className="text-[#6B7799] text-xs">
                  No Telugu distribution package yet — generates automatically after translation, or click 🔁 Regen Telugu posts.
                </p>
              )}
            </>
          ) : (
            <p className="text-[#6B7799] text-sm">No Telugu data yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Learnings tab (learning loop: metrics → postmortems → memories) ────────

function LearningsTab({ onToast }: { onToast: (m: string) => void }) {
  const [memories, setMemories] = useState<AqbMemoryRow[]>([]);
  const [postmortems, setPostmortems] = useState<AqbPostmortemRow[]>([]);
  const [busy, setBusy] = useState<"metrics" | "postmortem" | "improvement" | null>(null);

  const load = useCallback(async () => {
    const token = await fetchToken();
    if (!token) return;
    try {
      const [m, p] = await Promise.all([
        api<AqbMemoryRow[]>(token, "/intelligence/memories"),
        api<{ data: AqbPostmortemRow[] }>(token, "/intelligence/postmortems?limit=20"),
      ]);
      setMemories(m);
      setPostmortems(p.data);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }, [onToast]);

  useEffect(() => { void load(); }, [load]);

  async function trigger(kind: "metrics" | "postmortem" | "improvement", label: string) {
    setBusy(kind);
    onToast(`${label} running…`);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<Record<string, unknown>>(
        token, `/intelligence/${kind}-sweep`, { method: "POST" },
      );
      onToast(`✓ ${label}: ${JSON.stringify(r)}`);
      await load();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-4 space-y-3">
        <p className="text-[12px] text-[#B8C5E0]">
          The learning loop runs automatically (metrics hourly, postmortems daily after 3d, improvement weekly).
          Use these to trigger a sweep manually.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => trigger("metrics", "Metrics sweep")}
            disabled={busy === "metrics"}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-50 transition"
          >
            ⚡ {busy === "metrics" ? "…" : "Pull YouTube stats"}
          </button>
          <button
            onClick={() => trigger("postmortem", "Postmortem sweep")}
            disabled={busy === "postmortem"}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 disabled:opacity-50 transition"
          >
            📝 {busy === "postmortem" ? "…" : "Generate postmortems"}
          </button>
          <button
            onClick={() => trigger("improvement", "Improvement sweep")}
            disabled={busy === "improvement"}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 disabled:opacity-50 transition"
          >
            🧠 {busy === "improvement" ? "…" : "Mine winners → memories"}
          </button>
        </div>
      </div>

      <Block title={`🧠 Learned patterns (${memories.length})`}>
        {memories.length === 0 ? (
          <p className="text-[12px] text-[#6B7799]">
            No memories yet. Patterns appear after metrics → postmortems → improvement sweep.
          </p>
        ) : memories.map((m) => (
          <div key={m.id} className="border border-white/5 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-[#00D4FF]/15 text-[#00D4FF] uppercase">{m.memoryType}</span>
              <span className="text-[#6B7799]">applies to: {m.appliesTo.join(", ") || "all"}</span>
              <span className="text-[#6B7799] ml-auto">weight {m.weight}</span>
            </div>
            <p className="text-[12px] text-[#B8C5E0]">{m.content}</p>
          </div>
        ))}
      </Block>

      <Block title={`📝 Recent postmortems (${postmortems.length})`}>
        {postmortems.length === 0 ? (
          <p className="text-[12px] text-[#6B7799]">
            No postmortems yet. They generate for shorts published ≥3 days ago that have metrics.
          </p>
        ) : postmortems.map((p) => (
          <div key={p.id} className="border border-white/5 rounded-lg p-2.5 space-y-1">
            <p className="text-[10px] text-[#6B7799]">
              {new Date(p.createdAt).toLocaleString()} · script {p.scriptId.slice(0, 8)}
              {p.content.topicSignal ? ` · ${p.content.topicSignal}` : ""}
            </p>
            {p.content.reusableHookPattern && (
              <p className="text-[12px] text-[#B8C5E0]">
                <span className="text-[#00F5A0]">Hook pattern:</span> {p.content.reusableHookPattern}
              </p>
            )}
            {(p.content.worked ?? []).length > 0 && (
              <p className="text-[11px] text-emerald-300">
                ✓ {(p.content.worked ?? []).join(" · ")}
              </p>
            )}
            {(p.content.didntWork ?? []).length > 0 && (
              <p className="text-[11px] text-red-300">
                ✕ {(p.content.didntWork ?? []).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </Block>
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

const THUMB_STYLE_LABEL: Record<string, string> = {
  // NEW creative menu
  data_reveal: "🔢 Data reveal (big number)",
  product_screenshot: "🖥️ Product screenshot (annotated)",
  versus: "⚔️ Versus (face-off)",
  identity_target: "🎯 Identity callout",
  question_hook: "❓ Question hook",
  // EXISTING
  visual_metaphor: "🎭 Visual metaphor",
  bold_text: "🔠 Bold text",
  shocked_reaction: "😱 Shocked reaction (use sparingly)",
  brand_signature: "✨ Brand signature",
};

function ThumbnailVariations({ variations }: { variations: ThumbnailVariation[] }) {
  // Highlight the model's highest-CTR pick.
  const best = variations.reduce(
    (b, v) => (v.estimatedCtrScore > b ? v.estimatedCtrScore : b),
    -1,
  );
  return (
    <div className="space-y-3">
      {variations.map((v, i) => {
        const isBest = v.estimatedCtrScore === best;
        return (
          <div
            key={i}
            className={`border rounded-lg p-3 space-y-2 ${
              isBest ? "border-[#00F5A0]/40 bg-[#00F5A0]/5" : "border-white/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-[#B8C5E0]">
                {THUMB_STYLE_LABEL[v.style] ?? v.style}
                {isBest && (
                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-[#00F5A0]/20 text-[#00F5A0]">
                    ★ top pick
                  </span>
                )}
              </span>
              <span className="text-[10px] text-[#6B7799]">
                CTR ~{v.estimatedCtrScore}/100
              </span>
            </div>
            {v.reasoning && (
              <p className="text-[11px] text-[#6B7799] italic">{v.reasoning}</p>
            )}
            <CopyField label="Headline (overlay · EN)" value={v.headline} />
            {v.teluguHeadline && (
              <CopyField label="Headline (overlay · TE)" value={v.teluguHeadline} />
            )}
            <CopyField label="Image prompt" value={v.prompt} multiline />
          </div>
        );
      })}
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
