"use client";

// AI Squad — admin dashboard. API at /api/v1/admin/ai-squad (AdminGuard).
// Flow: Themes → Topics → Episodes (dialogue + thumbnails + distribution).

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchToken, api, STATUS_COLOR, CHAR_COLOR,
  type Theme, type Topic, type Episode, type LanguageVersion,
} from "./_helpers";

type Tab = "themes" | "topics" | "episodes";

export default function AiSquadPage() {
  const [tab, setTab] = useState<Tab>("themes");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">🤖 The AI Squad</h1>
        <p className="text-[#6B7799] text-sm mt-1">
          Themes → Topics → 4-character dramatic dialogue → thumbnails → distribution
        </p>
      </div>

      {toast && (
        <div className="bg-[#00F5A0]/10 border border-[#00F5A0]/30 rounded-xl p-3 text-[#00F5A0] text-sm">
          {toast}
        </div>
      )}

      <div className="flex gap-2 border-b border-white/10">
        {(["themes", "topics", "episodes"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition border-b-2 ${
              tab === t
                ? "border-[#00D4FF] text-white"
                : "border-transparent text-[#6B7799] hover:text-[#B8C5E0]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "themes" && <ThemesTab onToast={setToast} />}
      {tab === "topics" && <TopicsTab onToast={setToast} />}
      {tab === "episodes" && <EpisodesTab onToast={setToast} />}
    </div>
  );
}

// ── Themes ────────────────────────────────────────────────────────────────────

function ThemesTab({ onToast }: { onToast: (m: string) => void }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const res = await api<{ data: Theme[] }>(token, "/themes");
      setThemes(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    setBusy(true);
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      await api(token, `/themes/generate?count=${Number(count) || 5}`, { method: "POST" });
      onToast("✓ Themes generated");
      await load();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="w-16 bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
        />
        <PrimaryBtn label={busy ? "Generating…" : "✨ Generate Themes"} busy={busy} onClick={generate} />
        <span className="ml-auto text-[#6B7799] text-xs">{themes.length} themes</span>
      </div>

      {loading ? <Loading /> : themes.length === 0 ? (
        <Empty>No themes yet. Click Generate Themes.</Empty>
      ) : themes.map((t) => <ThemeCard key={t.id} theme={t} onToast={onToast} />)}
    </div>
  );
}

function ThemeCard({ theme, onToast }: { theme: Theme; onToast: (m: string) => void }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadTopics() {
    const token = await fetchToken();
    if (!token) return;
    const { topics: t } = await api<{ topics: Topic[] }>(token, `/themes/${theme.id}`);
    setTopics(t);
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await loadTopics();
  }

  async function genTopics() {
    setBusy(true);
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      await api(token, `/themes/${theme.id}/topics/generate?count=8`, { method: "POST" });
      onToast("✓ Topics generated");
      setOpen(true);
      await loadTopics();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[#B8C5E0] text-sm font-medium truncate">{theme.title}</p>
          <p className="text-[#6B7799] text-xs mt-0.5">{theme.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {theme.category && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#B8C5E0]">{theme.category}</span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[theme.status] ?? ""}`}>{theme.status}</span>
        </div>
      </div>
      <div className="px-4 py-2 border-t border-white/5 flex gap-2">
        <Btn label={busy ? "Generating…" : "🧩 Generate Topics"} onClick={genTopics} />
        <Btn label={open ? "Hide topics" : "Show topics"} onClick={toggle} />
      </div>
      {open && (
        <div className="px-4 py-3 border-t border-white/5 bg-[#0F1330] space-y-2">
          {topics.length === 0 ? (
            <p className="text-[#6B7799] text-xs">No topics yet.</p>
          ) : topics.map((tp) => (
            <div key={tp.id} className="text-xs text-[#B8C5E0] flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded ${STATUS_COLOR[tp.status] ?? ""}`}>{tp.status}</span>
              <span className="truncate">{tp.title}</span>
              <span className="text-[#6B7799] ml-auto shrink-0">{tp.format} · {tp.topicType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Topics ────────────────────────────────────────────────────────────────────

function TopicsTab({ onToast }: { onToast: (m: string) => void }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [idea, setIdea] = useState("");
  const [ideaFormat, setIdeaFormat] = useState<"long" | "short">("long");
  const [ideaBusy, setIdeaBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await api<{ data: Topic[] }>(token, `/topics${qs}`);
      setTopics(res.data);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function genEpisode(topicId: string) {
    onToast("Generating dialogue… (Claude, ~20-40s)");
    const token = await fetchToken();
    if (!token) return;
    try {
      await api(token, `/episodes/generate-from-topic/${topicId}`, { method: "POST" });
      onToast("✓ Episode generated — see Episodes tab");
      await load();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    }
  }

  async function submitIdea() {
    if (!idea.trim()) return;
    setIdeaBusy(true);
    onToast("Structuring your idea… (Claude)");
    const token = await fetchToken();
    if (!token) { setIdeaBusy(false); return; }
    try {
      await api(token, "/topics/custom", {
        method: "POST",
        body: JSON.stringify({ idea: idea.trim(), format: ideaFormat }),
      });
      setIdea("");
      onToast("✓ Custom topic created — find it below, then Generate Episode");
      await load();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setIdeaBusy(false); }
  }

  return (
    <div className="space-y-3">
      {/* Custom idea entry */}
      <div className="bg-[#151B3D] border border-[#00D4FF]/30 rounded-2xl p-4 space-y-2">
        <p className="text-[#B8C5E0] text-sm font-semibold">💡 Your own idea</p>
        <p className="text-[#6B7799] text-xs">
          Describe an episode in your own words — Claude structures it into a topic
          (picks characters, type, key concepts) under “Custom Ideas”. Then hit
          🎬 Generate Episode below.
        </p>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder="e.g. A dramatic debate on whether AI coding tools make junior devs worse — ATLAS vs LUNA, real hiring-data examples"
          className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#B8C5E0] focus:outline-none focus:border-[#00D4FF]"
        />
        <div className="flex items-center gap-2">
          <select
            value={ideaFormat}
            onChange={(e) => setIdeaFormat(e.target.value as "long" | "short")}
            className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
          >
            <option value="long">long (7-10 min)</option>
            <option value="short">short (30-60s)</option>
          </select>
          <PrimaryBtn
            label={ideaBusy ? "Structuring…" : "➕ Create from idea"}
            busy={ideaBusy}
            onClick={submitIdea}
          />
        </div>
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
      >
        <option value="">All statuses</option>
        {["planned", "in_production", "completed", "archived"].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {loading ? <Loading /> : topics.length === 0 ? (
        <Empty>No topics. Generate some from a theme.</Empty>
      ) : topics.map((tp) => (
        <div key={tp.id} className="bg-[#151B3D] border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[#B8C5E0] text-sm font-medium">{tp.title}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[tp.status] ?? ""}`}>{tp.status}</span>
          </div>
          {tp.angle && <p className="text-[#6B7799] text-xs italic">{tp.angle}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            {tp.recommendedCharacters.map((c) => (
              <span key={c} className={`text-[10px] px-2 py-0.5 rounded-full ${CHAR_COLOR[c] ?? ""}`}>{c}</span>
            ))}
            <span className="text-[10px] text-[#6B7799] ml-2">
              {tp.topicType} · {tp.format} · {tp.difficulty} · ~{tp.estimatedDurationMinutes}min
            </span>
          </div>
          <Btn label="🎬 Generate Episode" onClick={() => genEpisode(tp.id)} accent="#00F5A0" />
        </div>
      ))}
    </div>
  );
}

// ── Episodes ──────────────────────────────────────────────────────────────────

function EpisodesTab({ onToast }: { onToast: (m: string) => void }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await api<{ data: Episode[] }>(token, `/episodes${qs}`);
      setEpisodes(res.data);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="bg-[#151B3D] border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
      >
        <option value="">All statuses</option>
        {["planning", "dialogue_generated", "generating_videos", "ready", "approved", "published", "rejected", "failed"].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {loading ? <Loading /> : episodes.length === 0 ? (
        <Empty>No episodes. Generate one from a topic.</Empty>
      ) : episodes.map((ep) => <EpisodeCard key={ep.id} ep={ep} onToast={onToast} onChange={load} />)}
    </div>
  );
}

function EpisodeCard({ ep, onToast, onChange }: {
  ep: Episode; onToast: (m: string) => void; onChange: () => void;
}) {
  const [full, setFull] = useState<Episode | null>(null);
  const [langs, setLangs] = useState<LanguageVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadFull() {
    const token = await fetchToken();
    if (!token) return;
    const [e, lv] = await Promise.all([
      api<Episode>(token, `/episodes/${ep.id}`),
      api<LanguageVersion[]>(token, `/episodes/${ep.id}/languages`),
    ]);
    setFull(e);
    setLangs(lv);
  }
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !full) await loadFull();
  }

  async function translate() {
    setBusy(true);
    onToast("Translating to Hindi + Telugu… (Claude)");
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      await api(token, `/episodes/${ep.id}/translate`, { method: "POST" });
      onToast("✓ Translated — see language versions below");
      await loadFull();
      onChange();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function langAction(lang: string, label: string, path: string, body?: object) {
    setBusy(true);
    onToast(`${label} (${lang})…`);
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      const r = await api<{ skipped?: boolean }>(token, path, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      onToast(r?.skipped ? "⏸ HeyGen not configured (deferred)" : `✓ ${label} (${lang})`);
      await loadFull();
      onChange();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }
  async function act(label: string, path: string) {
    setBusy(true);
    onToast(`${label}…`);
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      const r = await api<{ skipped?: boolean }>(token, path, { method: "POST" });
      onToast(r?.skipped ? "⏸ HeyGen not configured (deferred)" : `✓ ${label}`);
      await loadFull();
      onChange();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const e = full ?? ep;
  const dist = e.distributionPackage as
    | Record<string, { full_text?: string; title?: string; description?: string; tags?: string[] }>
    | null;

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-[#B8C5E0] text-sm font-medium truncate flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[e.status] ?? ""}`}>{e.status}</span>
          Ep {e.episodeNumber}: {e.title}
        </span>
        <span className="text-[#6B7799] text-xs shrink-0">
          {e.format} · {e.totalSegments} seg · ${Number(e.llmCostUsd).toFixed(3)}
        </span>
      </div>
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {e.charactersUsed.map((c) => (
          <span key={c} className={`text-[10px] px-2 py-0.5 rounded-full ${CHAR_COLOR[c] ?? ""}`}>{c}</span>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-white/5 flex flex-wrap gap-2">
        <Btn label={open ? "Hide" : "📂 Open"} onClick={toggle} />
        <Btn label="🎥 Gen Videos" onClick={() => act("Videos queued", `/episodes/${e.id}/generate-videos`)} disabled={busy} />
        <Btn label="🖼 Thumbnails" onClick={() => act("Thumbnails", `/episodes/${e.id}/generate-thumbnails`)} disabled={busy} />
        <Btn label="📦 Distribution" onClick={() => act("Distribution", `/episodes/${e.id}/generate-distribution`)} disabled={busy} />
        <Btn label="🌍 Translate" accent="#00D4FF" onClick={translate} disabled={busy} />
        {e.status !== "approved" && e.status !== "published" && (
          <Btn label="✅ Approve" accent="#00F5A0" onClick={() => act("Approved", `/episodes/${e.id}/approve`)} disabled={busy} />
        )}
        {e.status !== "published" && (
          <Btn label="📲 Mark Published" onClick={async () => {
            const url = prompt("Published YouTube URL?") ?? "";
            if (!url) return;
            setBusy(true);
            const token = await fetchToken();
            if (!token) { setBusy(false); return; }
            try {
              await api(token, `/episodes/${e.id}/published`, {
                method: "POST", body: JSON.stringify({ youtubeUrl: url }),
              });
              onToast("✓ Marked published");
              await loadFull(); onChange();
            } catch (err) { onToast(`⚠ ${(err as Error).message}`); }
            finally { setBusy(false); }
          }} disabled={busy} />
        )}
      </div>

      {open && (
        <div className="px-4 py-4 border-t border-white/5 bg-[#0F1330] space-y-4">
          {full?.segments && full.segments.length > 0 && (
            <Block title={`💬 Dialogue (${full.segments.length} segments)`}>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {full.segments.map((s) => (
                  <div key={s.id} className="text-[12px]">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded mr-2 ${CHAR_COLOR[s.characterKey] ?? ""}`}>
                      {s.speakerName}{s.emotionTag ? ` · ${s.emotionTag}` : ""}
                    </span>
                    <span className="text-[#B8C5E0]">{s.textWithPauses ?? s.text}</span>
                  </div>
                ))}
              </div>
              <CopyField label="Full script" value={full.fullDialogueText ?? ""} multiline />
            </Block>
          )}

          {e.thumbnailPrompts && e.thumbnailPrompts.length > 0 && (
            <Block title="🖼 Thumbnail prompts">
              {e.thumbnailPrompts.map((v) => (
                <div key={v.index} className="space-y-1 border-b border-white/5 pb-2 last:border-0">
                  <p className="text-[11px] text-[#6B7799]">{v.style} · CTR {v.estimatedCtrScore}</p>
                  <CopyField label="Headline" value={v.headline} />
                  <CopyField label="Prompt" value={v.prompt} multiline />
                </div>
              ))}
            </Block>
          )}

          {dist && (
            <Block title="📦 Distribution">
              {dist.youtube && <CopyField label="YouTube title" value={dist.youtube.title ?? ""} />}
              {dist.youtube && <CopyField label="YouTube description" value={dist.youtube.description ?? ""} multiline />}
              {dist.youtube?.tags && <CopyField label="Tags" value={dist.youtube.tags.join(", ")} />}
              {dist.instagram && <CopyField label="Instagram" value={dist.instagram.full_text ?? ""} multiline />}
              {dist.linkedin && <CopyField label="LinkedIn" value={dist.linkedin.full_text ?? ""} multiline />}
              {dist.whatsapp_channel && <CopyField label="WhatsApp Channel" value={dist.whatsapp_channel.full_text ?? ""} multiline />}
              {dist.whatsapp_status && <CopyField label="WhatsApp Status" value={dist.whatsapp_status.full_text ?? ""} multiline />}
            </Block>
          )}

          {langs.length > 0 && (
            <Block title={`🌍 Languages (${langs.length})`}>
              {langs.map((lv) => (
                <div key={lv.id} className="space-y-1.5 border-b border-white/5 pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[#B8C5E0] text-xs font-semibold uppercase">
                      {lv.languageCode}{lv.isPrimary ? " · primary" : ""}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[lv.status] ?? "bg-slate-500/20 text-slate-300"}`}>
                      {lv.status}
                    </span>
                    {lv.publishedYoutubeUrl && (
                      <a href={lv.publishedYoutubeUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-[#00D4FF] underline ml-auto">published ↗</a>
                    )}
                  </div>
                  {lv.translatedFullText && (
                    <CopyField label={`${lv.languageCode} script`} value={lv.translatedFullText} multiline />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      label="🎥 Gen Videos"
                      disabled={busy}
                      onClick={() => langAction(lv.languageCode, "Videos queued",
                        `/episodes/${e.id}/languages/${lv.languageCode}/generate-videos`)}
                    />
                    {lv.status !== "published" && (
                      <Btn
                        label="📲 Mark Published"
                        disabled={busy}
                        onClick={() => {
                          const url = prompt(`Published YouTube URL for ${lv.languageCode}?`) ?? "";
                          if (!url) return;
                          void langAction(lv.languageCode, "Marked published",
                            `/episodes/${e.id}/languages/${lv.languageCode}/published`,
                            { youtubeUrl: url });
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </Block>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function Loading() {
  return <div className="text-[#6B7799] text-sm p-8 text-center">Loading…</div>;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center text-[#6B7799]">
      {children}
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
function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[#6B7799] uppercase">{label}</span>
        <button
          onClick={() => navigator.clipboard.writeText(value).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 1500);
          })}
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
function Btn({ label, onClick, accent, disabled }: {
  label: string; onClick: () => void; accent?: string; disabled?: boolean;
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
function PrimaryBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-4 py-2 text-sm font-semibold rounded-xl border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-50 transition"
    >
      {label}
    </button>
  );
}
