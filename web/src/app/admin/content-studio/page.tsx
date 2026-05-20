"use client";

// Content Studio — admin. API at /api/v1/admin/content-studio (AdminGuard).
// Slice 1: brands + Strategy Agent (week plan → theme + 2 lessons) + cost log.

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchToken, api, STATUS_COLOR,
  type Brand, type BrandMemory, type WeeklyPlan, type Lesson,
  type ScriptAsset, type PptAsset,
  type QuizPoolListResponse, type DeliveredQuizSummary,
  type PipelineRun, type PipelineStage, PIPELINE_STAGE_ORDER,
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
      </div>
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
  const [open, setOpen] = useState(false);
  const [openSlides, setOpenSlides] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyPpt, setBusyPpt] = useState(false);
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
        </div>

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
            </>
          )}
        </div>

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
      </div>
    </div>
  );
}

const STAGE_LABEL: Record<PipelineStage, string> = {
  script: "Scripts",
  ppt:    "Slides",
  quiz:   "Quiz pool",
  draw:   "Saturday draw",
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
