"use client";

// Content Studio — admin. API at /api/v1/admin/content-studio (AdminGuard).
// Slice 1: brands + Strategy Agent (week plan → theme + 2 lessons) + cost log.

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchToken, api, STATUS_COLOR,
  type Brand, type BrandMemory, type WeeklyPlan, type Lesson,
  type ScriptAsset, type PptAsset,
  type SeoAsset, type ThumbnailAsset, type PromoAsset,
  type QuizPoolListResponse, type DeliveredQuizSummary,
  type PipelineRun, type PipelineStage, PIPELINE_STAGE_ORDER,
  type DlqJob,
} from "./_helpers";

export default function ContentStudioPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const [b, p] = await Promise.all([
        api<{ data: Brand[] }>(token, "/brands"),
        api<{ data: WeeklyPlan[] }>(token, "/plans"),
      ]);
      setBrands(b.data);
      setPlans(p.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">🎬 Content Studio</h1>
        <p className="text-[#6B7799] text-sm mt-1">
          Brand → Strategy Agent → weekly plan (theme + 2 lessons). Script /
          PPT / Quiz agents come in later slices.
        </p>
      </div>

      {toast && (
        <div className="bg-[#00F5A0]/10 border border-[#00F5A0]/30 rounded-xl p-3 text-[#00F5A0] text-sm">
          {toast}
        </div>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          <DlqPanel onToast={setToast} />
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">Brands</h2>
            {brands.length === 0 ? (
              <Empty>No brands. Apply migration-001 (seeds AetherStackAI).</Empty>
            ) : (
              brands.map((b) => (
                <BrandCard key={b.id} brand={b} onToast={setToast} onChange={load} />
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
              Weekly plans
            </h2>
            {plans.length === 0 ? (
              <Empty>No plans yet. Generate a week from a brand above.</Empty>
            ) : (
              plans.map((p) => (
                <PlanCard key={p.id} plan={p} brands={brands} onToast={setToast} />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BrandCard({ brand, onToast, onChange }: {
  brand: Brand; onToast: (m: string) => void; onChange: () => void;
}) {
  const [mem, setMem] = useState<BrandMemory[] | null>(null);
  const [open, setOpen] = useState(false);
  const [weekOf, setWeekOf] = useState("");
  const [busy, setBusy] = useState(false);
  const [openOverrides, setOpenOverrides] = useState(false);
  const [overridesText, setOverridesText] = useState(
    JSON.stringify(brand.modelOverrides ?? {}, null, 2),
  );
  const [savingOverrides, setSavingOverrides] = useState(false);

  async function saveOverrides() {
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(overridesText || "{}");
      if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    } catch (e) {
      onToast(`⚠ Invalid JSON: ${(e as Error).message}`);
      return;
    }
    setSavingOverrides(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setSavingOverrides(false); return; }
    try {
      await api(token, `/brands/${brand.id}`, {
        method: "PATCH",
        body: JSON.stringify({ modelOverrides: parsed }),
      });
      onToast("✓ Brand overrides saved");
      onChange();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setSavingOverrides(false); }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !mem) {
      const token = await fetchToken();
      if (!token) return;
      setMem(await api<BrandMemory[]>(token, `/brands/${brand.id}/memories`));
    }
  }

  async function generate() {
    setBusy(true);
    onToast("Strategy Agent planning the week… (~20-60s)");
    const token = await fetchToken();
    if (!token) {
      onToast("⚠ Not signed in — reload and sign in again");
      setBusy(false);
      return;
    }
    try {
      await api(token, "/plans/generate", {
        method: "POST",
        body: JSON.stringify({
          brandId: brand.id,
          ...(weekOf ? { weekOf } : {}),
        }),
      });
      onToast("✓ Week plan generated — see Weekly plans below");
      onChange();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[#B8C5E0] text-sm font-semibold">{brand.name}</p>
          <p className="text-[#6B7799] text-xs mt-0.5 truncate">{brand.description}</p>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
          style={{
            background: `${brand.colorPrimary ?? "#00D4FF"}22`,
            color: brand.colorPrimary ?? "#00D4FF",
          }}
        >
          {brand.slug}
        </span>
      </div>
      <div className="px-4 py-2 border-t border-white/5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={weekOf}
          onChange={(e) => setWeekOf(e.target.value)}
          title="Week of (optional — defaults to this Monday)"
          className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
        />
        <PrimaryBtn
          label={busy ? "Planning…" : "✨ Generate Week"}
          busy={busy}
          onClick={generate}
        />
        <Btn label={open ? "Hide memories" : "🧠 Brand memories"} onClick={toggle} />
        <Btn
          label={
            openOverrides
              ? "Hide overrides"
              : Object.keys(brand.modelOverrides ?? {}).length > 0
              ? `🎛 Model overrides (${Object.keys(brand.modelOverrides).length})`
              : "🎛 Model overrides"
          }
          onClick={() => setOpenOverrides((v) => !v)}
        />
      </div>
      {openOverrides && (
        <div className="px-4 py-3 border-t border-white/5 bg-[#0F1330] space-y-2">
          <p className="text-[10px] text-[#6B7799] uppercase">
            Per-brand model overrides (JSON: task → model id). Wins over env / tier defaults.
          </p>
          <textarea
            value={overridesText}
            onChange={(e) => setOverridesText(e.target.value)}
            rows={6}
            spellCheck={false}
            className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#B8C5E0] font-mono"
            placeholder={`{\n  "strategy": "claude-opus-4-7",\n  "script": "claude-sonnet-4-6"\n}`}
          />
          <div className="flex items-center gap-2">
            <PrimaryBtn
              label={savingOverrides ? "Saving…" : "💾 Save overrides"}
              busy={savingOverrides}
              onClick={saveOverrides}
            />
            <span className="text-[10px] text-[#6B7799]">
              Valid keys: strategy · script · ppt · seo · thumbnail · promo · quiz · quiz_validator · grader
            </span>
          </div>
        </div>
      )}
      {open && (
        <div className="px-4 py-3 border-t border-white/5 bg-[#0F1330] space-y-1.5">
          {mem === null ? (
            <p className="text-[#6B7799] text-xs">Loading…</p>
          ) : mem.length === 0 ? (
            <p className="text-[#6B7799] text-xs">No memories.</p>
          ) : (
            mem.map((m) => (
              <div key={m.id} className="text-xs text-[#B8C5E0] flex gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#6B7799] shrink-0 uppercase">
                  {m.memoryType} · {Number(m.weight).toFixed(1)}
                </span>
                <span>{m.content}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, brands, onToast }: {
  plan: WeeklyPlan; brands: Brand[]; onToast: (m: string) => void;
}) {
  const [full, setFull] = useState<WeeklyPlan | null>(null);
  const [open, setOpen] = useState(false);
  const brandName = brands.find((b) => b.id === plan.brandId)?.name ?? "—";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !full) {
      const token = await fetchToken();
      if (!token) return;
      setFull(await api<WeeklyPlan>(token, `/plans/${plan.id}`));
    }
  }

  const p = full ?? plan;

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-[#B8C5E0] text-sm font-medium truncate flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[p.status] ?? ""}`}>
            {p.status}
          </span>
          {brandName} · week of {p.weekOf}
        </span>
        <span className="text-[#6B7799] text-xs shrink-0">
          {p.lessonCount ?? p.lessons?.length ?? 0} lessons · ${Number(p.totalCostUsd).toFixed(3)}
        </span>
      </div>
      {p.theme && (
        <p className="px-4 pb-2 text-[#B8C5E0] text-[13px]">
          <span className="text-[#6B7799]">Theme: </span>{p.theme}
        </p>
      )}
      <div className="px-4 py-2 border-t border-white/5">
        <Btn label={open ? "Hide" : "📂 Open plan"} onClick={toggle} />
      </div>
      {open && full && (
        <div className="px-4 py-4 border-t border-white/5 bg-[#0F1330] space-y-4">
          <PipelineRunPanel planId={full.id} onToast={onToast} />
          {full.quizScope && (
            <Block title="📝 Quiz scope">
              <p className="text-[12px] text-[#B8C5E0]">{full.quizScope}</p>
            </Block>
          )}
          <QuizPanel planId={full.id} onToast={onToast} />
          {(full.lessons ?? []).map((l) => (
            <LessonBlock key={l.id} lesson={l} onToast={onToast} />
          ))}
          {full.agentRuns && full.agentRuns.length > 0 && (
            <Block title={`⚙️ Agent runs (${full.agentRuns.length})`}>
              <div className="space-y-1">
                {full.agentRuns.map((r) => (
                  <div key={r.id} className="text-[11px] flex flex-wrap items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded ${STATUS_COLOR[r.status] ?? "bg-slate-500/20 text-slate-300"}`}>
                      {r.status}
                    </span>
                    <span className="text-[#B8C5E0]">{r.agentType}</span>
                    <span className="text-[#6B7799]">
                      {r.provider}/{r.model} · {r.promptTokens}+{r.completionTokens} tok ·
                      ${Number(r.costUsd).toFixed(4)} ·
                      {r.durationMs != null ? ` ${(r.durationMs / 1000).toFixed(1)}s` : ""}
                    </span>
                    {r.error && <span className="text-red-300">{r.error}</span>}
                  </div>
                ))}
              </div>
            </Block>
          )}
        </div>
      )}
    </div>
  );
}

function LessonBlock({ lesson, onToast }: {
  lesson: Lesson; onToast: (m: string) => void;
}) {
  const [script, setScript] = useState<ScriptAsset | null>(null);
  const [ppt, setPpt] = useState<PptAsset | null>(null);
  const [seo, setSeo] = useState<SeoAsset | null>(null);
  const [thumb, setThumb] = useState<ThumbnailAsset | null>(null);
  const [promo, setPromo] = useState<PromoAsset | null>(null);
  const [open, setOpen] = useState(false);
  const [openSlides, setOpenSlides] = useState(false);
  const [openSeo, setOpenSeo] = useState(false);
  const [openThumb, setOpenThumb] = useState(false);
  const [openPromo, setOpenPromo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyPpt, setBusyPpt] = useState(false);
  const [busySeo, setBusySeo] = useState(false);
  const [busyThumb, setBusyThumb] = useState(false);
  const [busyPromo, setBusyPromo] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await fetchToken();
      if (!token || cancelled) return;
      try {
        const s = await api<ScriptAsset>(token, `/lessons/${lesson.id}/script`);
        if (!cancelled) setScript(s);
      } catch { /* 404 — no script yet */ }
      try {
        const p = await api<PptAsset>(token, `/lessons/${lesson.id}/ppt`);
        if (!cancelled) setPpt(p);
      } catch { /* 404 — no ppt yet */ }
      try {
        const s = await api<SeoAsset>(token, `/lessons/${lesson.id}/seo`);
        if (!cancelled) setSeo(s);
      } catch { /* 404 */ }
      try {
        const t = await api<ThumbnailAsset>(token, `/lessons/${lesson.id}/thumbnail`);
        if (!cancelled) setThumb(t);
      } catch { /* 404 */ }
      try {
        const pr = await api<PromoAsset>(token, `/lessons/${lesson.id}/promo`);
        if (!cancelled) setPromo(pr);
      } catch { /* 404 */ }
    })();
    return () => { cancelled = true; };
  }, [lesson.id]);

  async function generate() {
    setBusy(true);
    onToast("Script Agent writing the lesson… (Claude, ~30-90s)");
    const token = await fetchToken();
    if (!token) {
      onToast("⚠ Not signed in — reload and sign in again");
      setBusy(false);
      return;
    }
    try {
      const s = await api<ScriptAsset>(token, `/lessons/${lesson.id}/script/generate`, {
        method: "POST",
      });
      setScript(s);
      setOpen(true);
      onToast(`✓ Script v${s.version} ready (${s.content?.wordCount ?? "?"} words)`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function generatePpt() {
    setBusyPpt(true);
    onToast("PPT Agent drafting 13 slides… (Claude, ~30-60s)");
    const token = await fetchToken();
    if (!token) {
      onToast("⚠ Not signed in — reload and sign in again");
      setBusyPpt(false);
      return;
    }
    try {
      const p = await api<PptAsset>(token, `/lessons/${lesson.id}/ppt/generate`, {
        method: "POST",
      });
      setPpt(p);
      setOpenSlides(true);
      onToast(`✓ Slides v${p.version} ready (${p.content?.slideCount ?? "?"} slides)`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusyPpt(false); }
  }

  async function generateAsset<T>(
    kind: "seo" | "thumbnail" | "promo",
    setBusyFn: (v: boolean) => void,
    setAsset: (a: T) => void,
    setOpenFn: (v: boolean) => void,
    label: string,
    versionFor: (a: T | null) => number,
  ) {
    setBusyFn(true);
    onToast(`${label} agent working… (~20-60s)`);
    const token = await fetchToken();
    if (!token) {
      onToast("⚠ Not signed in — reload and sign in again");
      setBusyFn(false);
      return;
    }
    try {
      const a = await api<T>(token, `/lessons/${lesson.id}/${kind}/generate`, {
        method: "POST",
      });
      setAsset(a);
      setOpenFn(true);
      onToast(`✓ ${label} v${versionFor(a)} ready`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusyFn(false); }
  }
  const generateSeo = () =>
    generateAsset<SeoAsset>(
      "seo", setBusySeo, setSeo, setOpenSeo, "SEO",
      (a) => a?.version ?? 0,
    );
  const generateThumb = () =>
    generateAsset<ThumbnailAsset>(
      "thumbnail", setBusyThumb, setThumb, setOpenThumb, "Thumbnail prompt",
      (a) => a?.version ?? 0,
    );
  const generatePromo = () =>
    generateAsset<PromoAsset>(
      "promo", setBusyPromo, setPromo, setOpenPromo, "Promo posts",
      (a) => a?.version ?? 0,
    );

  async function downloadPptx() {
    const token = await fetchToken();
    if (!token) {
      onToast("⚠ Not signed in — reload and sign in again");
      return;
    }
    onToast("Rendering .pptx…");
    try {
      const res = await fetch(
        `/api/v1/admin/content-studio/lessons/${lesson.id}/ppt/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
      }
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^";]+)"?/i.exec(cd);
      const filename = m?.[1] ?? `lesson-${lesson.lessonNumber}.pptx`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      onToast(`⬇ Downloaded ${filename}`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    }
  }

  const c = script?.content ?? null;
  const mins =
    c?.durationEstimateSeconds != null
      ? (c.durationEstimateSeconds / 60).toFixed(1)
      : null;

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-white/5 flex items-center justify-between gap-2">
        <span className="text-[#B8C5E0] text-xs font-semibold">
          🎓 Lesson {lesson.lessonNumber}: {lesson.title}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#6B7799] shrink-0">
          {lesson.status}
        </span>
      </div>
      <div className="p-3 space-y-2">
        {lesson.hook && (
          <p className="text-[12px] text-[#B8C5E0]">
            <span className="text-[#6B7799]">Hook: </span>{lesson.hook}
          </p>
        )}
        <p className="text-[10px] text-[#6B7799]">
          ~{lesson.targetDurationMinutes} min target · {lesson.outline?.length ?? 0} sections
        </p>
        <ul className="space-y-1.5">
          {(lesson.outline ?? []).map((s, i) => (
            <li key={i} className="text-[12px] text-[#B8C5E0]">
              <span className="font-semibold">{s.heading}</span>
              <ul className="list-disc list-inside text-[#6B7799] mt-0.5">
                {(s.points ?? []).map((pt, j) => <li key={j}>{pt}</li>)}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <PrimaryBtn
            label={
              busy
                ? "Writing…"
                : script
                ? `🔁 Regenerate Script (v${script.version + 1})`
                : "✍️ Generate Script"
            }
            busy={busy}
            onClick={generate}
          />
          {script && (
            <Btn
              label={open ? "Hide script" : `📜 View script (v${script.version})`}
              onClick={() => setOpen((v) => !v)}
            />
          )}
          {script && (
            <span className="text-[10px] text-[#6B7799] ml-auto">
              {c?.wordCount ?? "?"} words
              {mins ? ` · ~${mins} min` : ""}
              {c?.model ? ` · ${c.model}` : ""}
              {c?.costUsd != null ? ` · $${Number(c.costUsd).toFixed(4)}` : ""}
            </span>
          )}
          {script && <QualityBadge q={script} />}
        </div>
        {script && <CritiqueLine critique={script.critique} />}

        {open && script && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#6B7799] uppercase">
                Full audio script · v{script.version}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(c?.fullScript ?? "")
                    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
                }}
                disabled={!c?.fullScript}
                className="text-[10px] font-semibold text-[#00D4FF] hover:underline disabled:opacity-40"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <pre className="bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#B8C5E0] whitespace-pre-wrap font-mono max-h-[28rem] overflow-y-auto">
              {c?.fullScript || "—"}
            </pre>
          </div>
        )}

        {/* ── Slides (Slice 3) ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <PrimaryBtn
            label={
              busyPpt
                ? "Drafting slides…"
                : ppt
                ? `🔁 Regenerate Slides (v${ppt.version + 1})`
                : "🎨 Generate Slides (13)"
            }
            busy={busyPpt}
            onClick={generatePpt}
          />
          {ppt && (
            <>
              <Btn
                label={openSlides ? "Hide slides" : `👀 View slides (v${ppt.version})`}
                onClick={() => setOpenSlides((v) => !v)}
              />
              <Btn label="⬇ Download .pptx" onClick={downloadPptx} />
              <span className="text-[10px] text-[#6B7799] ml-auto">
                {ppt.content?.slideCount ?? "?"} slides
                {ppt.content?.model ? ` · ${ppt.content.model}` : ""}
                {ppt.content?.costUsd != null
                  ? ` · $${Number(ppt.content.costUsd).toFixed(4)}`
                  : ""}
              </span>
              <QualityBadge q={ppt} />
            </>
          )}
        </div>
        {ppt && <CritiqueLine critique={ppt.critique} />}

        {openSlides && ppt && (
          <ol className="space-y-1 list-decimal list-inside text-[12px] text-[#B8C5E0]">
            {(ppt.content?.slides ?? []).map((s, i) => (
              <li key={i} className="break-words">
                {s.kicker && (
                  <span className="text-[10px] uppercase tracking-wide text-[#FFB800] mr-1.5">
                    {s.kicker}
                  </span>
                )}
                <span className="font-semibold">{s.title ?? "(untitled)"}</span>
                {s.subtitle && (
                  <span className="text-[#6B7799]"> — {s.subtitle}</span>
                )}
                {s.body && (
                  <span className="text-[#6B7799]"> — {s.body}</span>
                )}
                {s.bullets && s.bullets.length > 0 && (
                  <span className="text-[#6B7799]">
                    {" "}· {s.bullets.length} bullets
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {/* ── SEO (Phase B / Slice B1) ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <PrimaryBtn
            label={
              busySeo
                ? "SEO…"
                : seo
                ? `🔁 Regenerate SEO (v${seo.version + 1})`
                : "🔎 Generate SEO"
            }
            busy={busySeo}
            onClick={generateSeo}
          />
          {seo && (
            <Btn
              label={openSeo ? "Hide SEO" : `📑 View SEO (v${seo.version})`}
              onClick={() => setOpenSeo((v) => !v)}
            />
          )}
          {seo && (
            <span className="text-[10px] text-[#6B7799] ml-auto">
              {seo.content?.titleVariants?.length ?? 0} titles
              {seo.content?.tags?.length ? ` · ${seo.content.tags.length} tags` : ""}
              {seo.content?.costUsd != null ? ` · $${Number(seo.content.costUsd).toFixed(4)}` : ""}
            </span>
          )}
          {seo && <QualityBadge q={seo} />}
        </div>
        {seo && <CritiqueLine critique={seo.critique} />}
        {openSeo && seo && (
          <div className="space-y-2 text-[12px] text-[#B8C5E0]">
            <p>
              <span className="text-[10px] uppercase text-[#FFB800] mr-1.5">CHOSEN TITLE</span>
              <span className="font-semibold">{seo.content?.chosenTitle ?? "—"}</span>
            </p>
            {seo.content?.titleVariants && (
              <details>
                <summary className="text-[10px] text-[#6B7799] cursor-pointer">
                  All {seo.content.titleVariants.length} title variants
                </summary>
                <ol className="list-decimal list-inside text-[11px] mt-1">
                  {seo.content.titleVariants.map((t, i) => (
                    <li key={i} className={i === seo.content?.chosenTitleIndex ? "text-[#00F5A0]" : ""}>{t}</li>
                  ))}
                </ol>
              </details>
            )}
            <CopyBox label="Description" value={seo.content?.description ?? ""} multiline />
            {seo.content?.tags && (
              <CopyBox label="Tags" value={seo.content.tags.join(", ")} />
            )}
            {seo.content?.endScreenCards && seo.content.endScreenCards.length > 0 && (
              <ul className="text-[11px] space-y-0.5">
                {seo.content.endScreenCards.map((c, i) => (
                  <li key={i}>
                    <span className="text-[10px] uppercase text-[#6B7799] mr-1">END</span>
                    <span className="font-semibold">{c.label}</span>
                    {c.why && <span className="text-[#6B7799]"> — {c.why}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Thumbnail prompt ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <PrimaryBtn
            label={
              busyThumb
                ? "Drafting…"
                : thumb
                ? `🔁 Regenerate Thumbnail (v${thumb.version + 1})`
                : "🎨 Generate Thumbnail Prompt"
            }
            busy={busyThumb}
            onClick={generateThumb}
          />
          {thumb && (
            <Btn
              label={openThumb ? "Hide prompt" : `🖼 View prompt (v${thumb.version})`}
              onClick={() => setOpenThumb((v) => !v)}
            />
          )}
          {thumb && (
            <span className="text-[10px] text-[#6B7799] ml-auto">
              face: {thumb.content?.facePosition ?? "—"} · {thumb.content?.style ?? "—"}
              {thumb.content?.costUsd != null ? ` · $${Number(thumb.content.costUsd).toFixed(4)}` : ""}
            </span>
          )}
          {thumb && <QualityBadge q={thumb} />}
        </div>
        {thumb && <CritiqueLine critique={thumb.critique} />}
        {openThumb && thumb && (
          <div className="space-y-2 text-[12px] text-[#B8C5E0]">
            <CopyBox label="Main prompt (paste into Midjourney / DALL-E)" value={thumb.content?.mainPrompt ?? ""} multiline />
            <p className="text-[11px] text-[#6B7799]">
              Text overlay: <span className="text-[#B8C5E0] font-semibold">{thumb.content?.textOverlay ?? "—"}</span>
              {thumb.content?.mood && <> · Mood: {thumb.content.mood}</>}
              {thumb.content?.colorPalette && thumb.content.colorPalette.length > 0 && (
                <> · Palette: {thumb.content.colorPalette.join(" ")}</>
              )}
            </p>
            {thumb.content?.alternates && thumb.content.alternates.length > 0 && (
              <details>
                <summary className="text-[10px] text-[#6B7799] cursor-pointer">
                  {thumb.content.alternates.length} alternates
                </summary>
                <div className="space-y-1 mt-1">
                  {thumb.content.alternates.map((a, i) => (
                    <CopyBox key={i} label={`Alt ${i + 1}`} value={a} multiline />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ── Promotion posts ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <PrimaryBtn
            label={
              busyPromo
                ? "Writing posts…"
                : promo
                ? `🔁 Regenerate Promo (v${promo.version + 1})`
                : "📣 Generate Promo Posts"
            }
            busy={busyPromo}
            onClick={generatePromo}
          />
          {promo && (
            <Btn
              label={openPromo ? "Hide promo" : `📨 View promo (v${promo.version})`}
              onClick={() => setOpenPromo((v) => !v)}
            />
          )}
          {promo && (
            <span className="text-[10px] text-[#6B7799] ml-auto">
              LI · IG · WhatsApp
              {promo.content?.costUsd != null ? ` · $${Number(promo.content.costUsd).toFixed(4)}` : ""}
            </span>
          )}
          {promo && <QualityBadge q={promo} />}
        </div>
        {promo && <CritiqueLine critique={promo.critique} />}
        {openPromo && promo && (
          <div className="space-y-2 text-[12px] text-[#B8C5E0]">
            {promo.content?.linkedin && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#6B7799]">LinkedIn</p>
                <CopyBox
                  label="Full LinkedIn post"
                  value={[
                    promo.content.linkedin.hook,
                    "",
                    promo.content.linkedin.body,
                    "",
                    promo.content.linkedin.cta,
                    (promo.content.linkedin.hashtags ?? []).map((h) => `#${h}`).join(" "),
                  ].filter(Boolean).join("\n")}
                  multiline
                />
              </div>
            )}
            {promo.content?.instagram && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#6B7799]">Instagram</p>
                <CopyBox
                  label="Caption + tags"
                  value={
                    (promo.content.instagram.caption ?? "") +
                    "\n\n" +
                    (promo.content.instagram.hashtags ?? []).map((h) => `#${h}`).join(" ")
                  }
                  multiline
                />
              </div>
            )}
            {promo.content?.whatsappStatus && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#6B7799]">
                  WhatsApp Status · {promo.content.whatsappStatus.chars ?? "?"}/700 chars ·
                  {" "}{promo.content.whatsappStatus.lines ?? "?"}/10 lines
                </p>
                <CopyBox
                  label="WhatsApp Status text"
                  value={promo.content.whatsappStatus.text ?? ""}
                  multiline
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline quality chip + revision count + optional critique (Phase B Grader). */
function QualityBadge({ q }: { q: { qualityScore: number | null; revisions: number; critique: string | null; confidence: number | null } }) {
  if (q.qualityScore == null) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400">
        not graded
      </span>
    );
  }
  const tone =
    q.qualityScore >= 80 ? "bg-emerald-500/20 text-emerald-300"
    : q.qualityScore >= 70 ? "bg-blue-500/20 text-blue-300"
    : q.qualityScore >= 50 ? "bg-amber-500/20 text-amber-300"
    : "bg-red-500/20 text-red-300";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${tone}`}>
      score {q.qualityScore}
      {q.confidence != null ? ` · conf ${q.confidence.toFixed(2)}` : ""}
      {q.revisions > 0 ? ` · ${q.revisions} rev` : ""}
    </span>
  );
}

/** Yellow critique callout shown when the grader left issues unresolved. */
function CritiqueLine({ critique }: { critique: string | null }) {
  if (!critique) return null;
  return (
    <p className="text-[11px] text-[#FFB800]/90 italic mt-1">
      ⚠ Grader notes: {critique}
    </p>
  );
}

/** Small reusable "label + monospace box + copy" helper for asset previews. */
function CopyBox({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
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
      <pre className={`bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#B8C5E0] whitespace-pre-wrap font-mono ${multiline ? "max-h-72 overflow-y-auto" : "truncate"}`}>
        {value || "—"}
      </pre>
    </div>
  );
}

function DlqPanel({ onToast }: { onToast: (m: string) => void }) {
  const [jobs, setJobs] = useState<DlqJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await fetchToken();
    if (!token) return;
    try {
      const r = await api<{ data: DlqJob[] }>(token, "/dlq?status=pending");
      setJobs(r.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function action(id: string, kind: "retry" | "abandon") {
    setBusy(id);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      await api(token, `/dlq/${id}/${kind}`, { method: "POST" });
      onToast(kind === "retry" ? "✓ Re-queued — see the plan's pipeline panel" : "✓ Abandoned");
      await load();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(null); }
  }

  if (jobs.length === 0) return null;

  return (
    <section className="bg-red-500/5 border border-red-500/30 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-red-300 uppercase tracking-wide">
          ⚠️ Dead-letter queue · {jobs.length} pending
        </h2>
        <button onClick={() => void load()} className="text-[10px] text-[#6B7799] hover:text-white">refresh</button>
      </div>
      <div className="space-y-1.5">
        {jobs.map((j) => (
          <div key={j.id} className="flex items-start gap-2 text-[12px] text-[#B8C5E0]">
            <div className="flex-1 min-w-0">
              <p>
                <span className="text-[10px] uppercase text-red-300 mr-1.5">
                  {j.jobType}
                </span>
                {j.payload?.stage && (
                  <span className="text-[#FFB800] mr-1.5">stage: {j.payload.stage}</span>
                )}
                {j.payload?.planId && (
                  <span className="text-[#6B7799] mr-1.5">plan: {j.payload.planId.slice(0, 8)}…</span>
                )}
              </p>
              {j.error && (
                <p className="text-[11px] text-red-300/80 break-words">{j.error}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => action(j.id, "retry")}
                disabled={busy === j.id}
                className="px-2 py-1 text-[10px] font-semibold rounded-md border border-[#FFB800]/40 text-[#FFB800] hover:bg-[#FFB800]/10 disabled:opacity-40 transition"
              >
                🔁 Retry
              </button>
              <button
                onClick={() => action(j.id, "abandon")}
                disabled={busy === j.id}
                className="px-2 py-1 text-[10px] font-semibold rounded-md border border-white/10 text-[#6B7799] hover:text-white hover:bg-white/5 disabled:opacity-40 transition"
              >
                Abandon
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const STAGE_LABEL: Record<PipelineStage, string> = {
  script:    "Scripts",
  ppt:       "Slides",
  seo:       "SEO",
  thumbnail: "Thumbnail",
  promo:     "Promo",
  quiz:      "Quiz pool",
  draw:      "Saturday draw",
};

function StageChip({ stage, state }: {
  stage: PipelineStage;
  state: "done" | "current" | "pending" | "failed";
}) {
  const icon =
    state === "done" ? "✓" : state === "current" ? "⟳" : state === "failed" ? "✗" : "·";
  const tone =
    state === "done"
      ? "bg-emerald-500/20 text-emerald-300"
      : state === "current"
      ? "bg-violet-500/20 text-violet-300 animate-pulse"
      : state === "failed"
      ? "bg-red-500/20 text-red-300"
      : "bg-slate-500/15 text-slate-400";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${tone}`}>
      <span className="mr-1">{icon}</span>{STAGE_LABEL[stage]}
    </span>
  );
}

function PipelineRunPanel({ planId, onToast }: {
  planId: string; onToast: (m: string) => void;
}) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = await fetchToken();
    if (!token) return;
    try {
      const r = await api<PipelineRun | null>(token, `/plans/${planId}/runs/latest`);
      setRun(r);
    } catch { /* ignore */ }
  }, [planId]);

  useEffect(() => { void load(); }, [load]);

  // Auto-poll every 5s while the run is active.
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const t = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(t);
  }, [run, load]);

  async function start(fromStage?: PipelineStage) {
    setBusy(true);
    onToast(
      fromStage
        ? `Resuming pipeline from ${STAGE_LABEL[fromStage]}…`
        : "Kicking off the full pipeline (Scripts → Slides → Quiz → Draw)…",
    );
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(false); return; }
    try {
      const r = await api<PipelineRun>(token, `/plans/${planId}/run`, {
        method: "POST",
        ...(fromStage ? { body: JSON.stringify({ fromStage }) } : {}),
      });
      setRun(r);
      onToast("✓ Queued — watch the stage chips above");
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const active = run && (run.status === "queued" || run.status === "running");
  const failed = run && run.status === "failed";

  function stageState(stage: PipelineStage) {
    if (!run) return "pending" as const;
    if (run.stagesCompleted?.includes(stage)) return "done" as const;
    if (run.currentStage === stage && (run.status === "running" || run.status === "queued"))
      return "current" as const;
    if (run.stagesFailed?.some((f) => f.stage === stage)) return "failed" as const;
    return "pending" as const;
  }

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-white/5 text-[#B8C5E0] text-xs font-semibold flex items-center justify-between gap-2">
        <span>⚙️ Pipeline</span>
        {run && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[run.status] ?? "bg-slate-500/20 text-slate-300"}`}>
            {run.status}
            {run.status === "completed" || run.status === "failed"
              ? ` · +$${Number(run.costDelta ?? 0).toFixed(3)}`
              : ""}
          </span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPELINE_STAGE_ORDER.map((s) => (
            <StageChip key={s} stage={s} state={stageState(s)} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <PrimaryBtn
            label={
              busy
                ? "Queuing…"
                : active
                ? "⏳ Running…"
                : run?.status === "completed"
                ? "🔄 Re-run pipeline"
                : "▶️ Run pipeline"
            }
            busy={busy || !!active}
            onClick={() => start()}
          />
          {failed && run?.resumableFrom && (
            <button
              onClick={() => start(run.resumableFrom!)}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#FFB800]/40 text-[#FFB800] hover:bg-[#FFB800]/10 disabled:opacity-40 transition"
            >
              🔁 Resume from {STAGE_LABEL[run.resumableFrom]}
            </button>
          )}
          {active && (
            <span className="text-[10px] text-[#6B7799] ml-auto">
              auto-refreshing every 5s
            </span>
          )}
        </div>

        {run?.stagesFailed && run.stagesFailed.length > 0 && (
          <div className="text-[11px] space-y-0.5 pt-1">
            {run.stagesFailed.map((f, i) => (
              <p key={i} className="text-red-300">
                <span className="font-semibold">{STAGE_LABEL[f.stage]}:</span> {f.error}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuizPanel({ planId, onToast }: { planId: string; onToast: (m: string) => void }) {
  const [pool, setPool] = useState<QuizPoolListResponse | null>(null);
  const [drawn, setDrawn] = useState<DeliveredQuizSummary | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [drawBusy, setDrawBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    const token = await fetchToken();
    if (!token) return;
    try {
      const p = await api<QuizPoolListResponse>(token, `/plans/${planId}/quiz/pool`);
      setPool(p);
    } catch { /* ignore */ }
    try {
      const d = await api<DeliveredQuizSummary>(token, `/plans/${planId}/quiz`);
      setDrawn(d);
    } catch { /* ignore */ }
  }, [planId]);

  useEffect(() => { void reload(); }, [reload]);

  async function generate() {
    setGenBusy(true);
    onToast("Generating 50 questions + cross-provider validation… (~60-120s)");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setGenBusy(false); return; }
    try {
      const r = await api<{ generated: number; valid: number; passRate: number; generatorProvider: string }>(
        token, `/plans/${planId}/quiz/generate`, { method: "POST" },
      );
      onToast(`✓ Pool ready: ${r.valid}/${r.generated} valid (${Math.round(r.passRate * 100)}%) · validated by NON-${r.generatorProvider}`);
      await reload();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setGenBusy(false); }
  }

  async function draw() {
    setDrawBusy(true);
    onToast("Drawing Saturday quiz (4 easy + 3 med + 2 hard)…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setDrawBusy(false); return; }
    try {
      await api(token, `/plans/${planId}/quiz/draw`, { method: "POST" });
      onToast("✓ Saturday quiz drawn");
      await reload();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setDrawBusy(false); }
  }

  async function download(variant: "public" | "private") {
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); return; }
    onToast(`Rendering ${variant} .xlsx…`);
    try {
      const res = await fetch(
        `/api/v1/admin/content-studio/plans/${planId}/quiz/download?variant=${variant}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
      }
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^";]+)"?/i.exec(cd);
      const filename = m?.[1] ?? `quiz-${variant}.xlsx`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      onToast(`⬇ Downloaded ${filename}`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    }
  }

  const validCount = pool?.valid ?? 0;
  const totalCount = pool?.count ?? 0;
  const canDraw = validCount >= 9 && !drawBusy;

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-white/5 text-[#B8C5E0] text-xs font-semibold flex items-center justify-between gap-2">
        <span>📚 Saturday Quiz</span>
        <span className="text-[10px] text-[#6B7799]">
          {totalCount > 0
            ? `${validCount}/${totalCount} valid · ${Math.round((pool?.passRate ?? 0) * 100)}% pass`
            : "no pool yet"}
        </span>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryBtn
            label={
              genBusy
                ? "Generating + validating…"
                : totalCount === 0
                ? "📝 Generate Pool (50)"
                : "🔁 Regenerate Pool"
            }
            busy={genBusy}
            onClick={generate}
          />
          <button
            onClick={draw}
            disabled={!canDraw || genBusy}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 disabled:opacity-40 transition"
            title={
              validCount < 9
                ? `Need ≥9 validated questions to draw (have ${validCount})`
                : "Draw 4 easy + 3 medium + 2 hard"
            }
          >
            {drawBusy ? "Drawing…" : "🎲 Draw Saturday Quiz"}
          </button>
          {drawn?.delivered && (
            <>
              <Btn label="⬇ Public .xlsx" onClick={() => download("public")} />
              <Btn label="⬇ Private .xlsx (answers)" onClick={() => download("private")} />
            </>
          )}
          {totalCount > 0 && (
            <Btn
              label={open ? "Hide pool" : `👀 View pool (${totalCount})`}
              onClick={() => setOpen((v) => !v)}
            />
          )}
        </div>

        {drawn?.delivered && drawn.questions.length > 0 && (
          <div className="text-[11px] text-[#6B7799] space-y-0.5">
            <p className="text-[#B8C5E0] font-semibold">
              Drawn for week of {drawn.delivered.weekOf}:
            </p>
            <ol className="list-decimal list-inside text-[#B8C5E0] space-y-0.5">
              {drawn.questions.map((q) => (
                <li key={q.id} className="break-words">
                  <span className="text-[10px] uppercase mr-1.5 text-[#FFB800]">
                    {q.difficulty}
                  </span>
                  {q.question}
                </li>
              ))}
            </ol>
          </div>
        )}

        {open && pool && (
          <div className="max-h-72 overflow-y-auto space-y-1.5 border-t border-white/5 pt-2">
            {pool.data.map((q, i) => (
              <div key={q.id} className="text-[11px] text-[#B8C5E0]">
                <span className={`text-[10px] px-1.5 py-0.5 rounded mr-1.5 ${
                  q.validationPassed ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                }`}>
                  {q.validationPassed ? "valid" : "invalid"}
                </span>
                <span className="text-[10px] uppercase mr-1.5 text-[#6B7799]">{q.difficulty}</span>
                {i + 1}. {q.question}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function Loading() {
  return <div className="text-[#6B7799] text-sm p-8 text-center">Loading…</div>;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-10 text-center text-[#6B7799] text-sm">
      {children}
    </div>
  );
}
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-white/5 text-[#B8C5E0] text-xs font-semibold">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}
function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:text-white hover:bg-white/5 transition"
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
      className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-50 transition"
    >
      {label}
    </button>
  );
}
