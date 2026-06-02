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
  type QuizBundleResp, type QuizPromoResp,
  type QuizWinnerResp,
  type PipelineRun, type PipelineStage, PIPELINE_STAGE_ORDER,
  type DlqJob,
  type AuditEntry, type AssetVersionMeta, type RollbackableAssetType,
  type StatsBundle, type QualityPoint,
  type CompetitorChannel, type CompetitorVideo,
  type LessonMetricsRow, type LessonPostmortemRow,
  type PublishedVideoRow, type CommentDraftsResponse,
  type ContentSeries, type SeriesDetail, type SeriesPlanAllResponse,
  type SeriesWeekArc,
  type LessonFormat, LESSON_FORMATS,
  type AudioAsset,
  type ChannelVideosResp,
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
          <DashboardPanel />
          <ChannelPanel brands={brands} onToast={setToast} />
          <IntelligencePanel brands={brands} onToast={setToast} />
          <SeriesPanel brands={brands} onToast={setToast} onChange={load} />
          <DlqPanel onToast={setToast} />
          <AuditPanel />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
                Brands
              </h2>
              <NewBrandButton onToast={setToast} onCreated={load} />
            </div>
            {brands.length === 0 ? (
              <Empty>No brands. Apply migration-001 (seeds AetherStackAI) or click ➕ Add brand.</Empty>
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
                <PlanCard key={p.id} plan={p} brands={brands} onToast={setToast} onChange={load} />
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
  // Optional curator steering for the next plan — empty = pure StrategyAgent.
  const [customIdea, setCustomIdea] = useState("");
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
    const idea = customIdea.trim();
    onToast(
      idea
        ? `Strategy Agent planning with your idea… (~20-60s)`
        : "Strategy Agent planning the week… (~20-60s)",
    );
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
          ...(idea ? { customIdea: idea } : {}),
        }),
      });
      onToast("✓ Week plan generated — see Weekly plans below");
      onChange();
      setCustomIdea(""); // clear after success
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function planAhead() {
    const weeksStr = prompt("Plan how many future weeks?", "4");
    if (!weeksStr) return;
    const weeks = parseInt(weeksStr, 10);
    if (!Number.isFinite(weeks) || weeks < 1) return;
    setBusy(true);
    onToast(`Planning next ${weeks} weeks… (Strategy × ${weeks})`);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(false); return; }
    try {
      const r = await api<{ weeks: Array<{ weekOf: string; theme: string | null }> }>(
        token, `/brands/${brand.id}/plan-ahead`,
        { method: "POST", body: JSON.stringify({ weeks }) },
      );
      onToast(`✓ ${r.weeks.length} weeks planned`);
      onChange();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(false); }
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
      <div className="px-4 py-2 border-t border-white/5 space-y-2">
        <textarea
          value={customIdea}
          onChange={(e) => setCustomIdea(e.target.value)}
          placeholder={`Optional custom idea for this week — e.g. "make it about evaluating LLM apps in production" or "two lessons on RAG vs fine-tuning trade-offs". Leave blank for pure auto.`}
          rows={2}
          className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40 resize-y"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
            title="Week of (optional — defaults to this Monday)"
            className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
          />
          <PrimaryBtn
            label={busy ? "Planning…" : customIdea.trim() ? "✨ Generate Week (custom)" : "✨ Generate Week"}
            busy={busy}
            onClick={generate}
          />
          <Btn label="📅 Plan N weeks" onClick={planAhead} />
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
        <div className="px-4 py-3 border-t border-white/5 bg-[#0F1330] space-y-2">
          {mem === null ? (
            <p className="text-[#6B7799] text-xs">Loading…</p>
          ) : mem.length === 0 ? (
            <p className="text-[#6B7799] text-xs">No memories yet.</p>
          ) : (
            <div className="space-y-1">
              {mem.map((m) => (
                <div key={m.id} className="text-xs text-[#B8C5E0] flex gap-2 items-start">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#6B7799] shrink-0 uppercase">
                    {m.memoryType} · {Number(m.weight).toFixed(1)}
                  </span>
                  <span className="flex-1">{m.content}</span>
                  <button
                    onClick={async () => {
                      if (!confirm("Soft-delete this memory?")) return;
                      const token = await fetchToken();
                      if (!token) return;
                      try {
                        await api(token, `/brands/${brand.id}/memories/${m.id}`, { method: "DELETE" });
                        onToast("✓ Memory removed");
                        setMem((cur) => (cur ?? []).filter((x) => x.id !== m.id));
                      } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
                    }}
                    className="text-[10px] text-red-300 hover:underline shrink-0"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <AddMemoryForm
            brandId={brand.id} onToast={onToast}
            onAdded={(m) => setMem((cur) => [m, ...(cur ?? [])])}
          />
        </div>
      )}
    </div>
  );
}

function AddMemoryForm({ brandId, onToast, onAdded }: {
  brandId: string;
  onToast: (m: string) => void;
  onAdded: (m: BrandMemory) => void;
}) {
  const [content, setContent] = useState("");
  const [memoryType, setMemoryType] = useState("style");
  const [weight, setWeight] = useState("1");
  const [appliesTo, setAppliesTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const allAgents = ["strategy", "script", "ppt", "seo", "thumbnail", "promo", "quiz"];

  function toggleApply(a: string) {
    setAppliesTo((cur) => cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]);
  }

  async function add() {
    if (!content.trim()) { onToast("⚠ content required"); return; }
    setBusy(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(false); return; }
    try {
      const created = await api<BrandMemory>(
        token, `/brands/${brandId}/memories`,
        {
          method: "POST",
          body: JSON.stringify({
            memoryType, content: content.trim(),
            weight: Number(weight) || 1,
            appliesTo,
          }),
        },
      );
      onToast("✓ Memory added (embedding queued)");
      setContent(""); setAppliesTo([]);
      onAdded(created);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="border border-white/5 rounded-lg p-2 space-y-1.5">
      <p className="text-[10px] text-[#6B7799] uppercase">Add a memory</p>
      <textarea
        value={content} onChange={(e) => setContent(e.target.value)}
        rows={2}
        placeholder='e.g. "Open with concrete stakes — a number, a failure, or a contrarian claim."'
        className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-[#B8C5E0]"
      />
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <select
          value={memoryType} onChange={(e) => setMemoryType(e.target.value)}
          className="bg-[#0A0E27] border border-white/10 rounded px-1.5 py-1 text-[11px] text-white"
        >
          {["voice", "style", "hook", "structure", "do", "dont"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="text-[#6B7799] flex items-center gap-1">
          weight
          <input
            type="number" step="0.1" min="0" max="5"
            value={weight} onChange={(e) => setWeight(e.target.value)}
            className="w-14 bg-[#0A0E27] border border-white/10 rounded px-1 py-0.5 text-[11px] text-white"
          />
        </label>
        <span className="text-[#6B7799]">applies to:</span>
        {allAgents.map((a) => (
          <button
            key={a}
            onClick={() => toggleApply(a)}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
              appliesTo.includes(a)
                ? "border-[#00F5A0] text-[#00F5A0]"
                : "border-white/10 text-[#6B7799] hover:text-white"
            }`}
          >{a}</button>
        ))}
        <PrimaryBtn label={busy ? "Adding…" : "➕ Add"} busy={busy} onClick={add} />
      </div>
      <p className="text-[9px] text-[#6B7799]">
        Empty applies-to = applies to every agent (backward compat).
      </p>
    </div>
  );
}

function PlanCard({ plan, brands, onToast, onChange }: {
  plan: WeeklyPlan; brands: Brand[]; onToast: (m: string) => void; onChange?: () => void;
}) {
  const [full, setFull] = useState<WeeklyPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [approval, setApprovalState] = useState(plan.approvalStatus ?? "pending");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenIdea, setRegenIdea] = useState("");
  const [regenKeepTheme, setRegenKeepTheme] = useState(false);

  async function regeneratePlan() {
    const idea = regenIdea.trim();
    const label = regenKeepTheme
      ? `Regenerating plan (keeping theme${idea ? ", with custom idea" : ""})…`
      : `Regenerating whole plan${idea ? " with custom idea" : ""}…`;
    if (
      !confirm(
        `Regenerate this plan? This wipes lessons + assets + quiz pool + bundle + promo. ` +
        `Approval flips back to pending. ${regenKeepTheme ? "Theme will be preserved." : "Theme will be re-picked."}`,
      )
    ) return;
    setRegenBusy(true);
    onToast(label);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setRegenBusy(false); return; }
    try {
      await api(token, `/plans/${plan.id}/regenerate`, {
        method: "POST",
        body: JSON.stringify({
          ...(idea ? { customIdea: idea } : {}),
          keepTheme: regenKeepTheme,
        }),
      });
      onToast("✓ Plan regenerated — pipeline blocked until you re-approve");
      setRegenIdea("");
      setRegenOpen(false);
      onChange?.();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setRegenBusy(false); }
  }

  async function deletePlan() {
    if (!confirm(`Delete this week plan (${plan.weekOf})? This removes its lessons, assets, quiz and runs — cannot be undone.`)) return;
    setDeleting(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setDeleting(false); return; }
    try {
      await api(token, `/plans/${plan.id}`, { method: "DELETE" });
      onToast("✓ Plan deleted");
      onChange?.();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
      setDeleting(false);
    }
  }
  const brandName = brands.find((b) => b.id === plan.brandId)?.name ?? "—";

  async function setApproval(status: "approved" | "rejected") {
    if (status === "rejected" && !confirm("Reject this plan? The pipeline stays blocked.")) return;
    setApprovalBusy(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setApprovalBusy(false); return; }
    try {
      await api(token, `/plans/${plan.id}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setApprovalState(status);
      onToast(status === "approved" ? "✓ Plan approved — pipeline can run" : "Plan rejected");
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setApprovalBusy(false); }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !full) {
      const token = await fetchToken();
      if (!token) return;
      setFull(await api<WeeklyPlan>(token, `/plans/${plan.id}`));
    }
  }

  async function reloadPlan() {
    const token = await fetchToken();
    if (!token) return;
    try { setFull(await api<WeeklyPlan>(token, `/plans/${plan.id}`)); }
    catch { /* ignore */ }
  }

  const p = full ?? plan;

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-[#B8C5E0] text-sm font-medium truncate flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[p.status] ?? ""}`}>
            {p.status}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${APPROVAL_COLOR[approval] ?? ""}`}>
            {approval === "approved" ? "✓ approved" : approval === "rejected" ? "✕ rejected" : "⏳ pending"}
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
      {p.seriesId && (
        <p className="px-4 pb-2 text-[11px] text-[#00F5A0]">
          📚 part of a series · week {p.seriesWeekNumber ?? "?"}
        </p>
      )}
      {p.notes && (
        <p className="px-4 pb-2 text-[11px] text-[#6B7799] italic">
          “{p.notes}”
        </p>
      )}
      <div className="px-4 py-2 border-t border-white/5 flex flex-wrap items-center gap-2">
        <Btn label={open ? "Hide" : "📂 Open plan"} onClick={toggle} />
        {approval !== "approved" && (
          <button
            onClick={() => setApproval("approved")}
            disabled={approvalBusy}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 disabled:opacity-50 transition"
            title="Approve so the pipeline can run"
          >
            ✓ Approve
          </button>
        )}
        {approval !== "rejected" && (
          <button
            onClick={() => setApproval("rejected")}
            disabled={approvalBusy}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-400/30 text-red-300 hover:bg-red-400/10 disabled:opacity-50 transition"
          >
            ✕ Reject
          </button>
        )}
        {approval !== "approved" && (
          <span className="text-[10px] text-[#6B7799]">pipeline blocked until approved</span>
        )}
        <button
          onClick={() => setRegenOpen((v) => !v)}
          className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#FFB020]/40 text-[#FFB020] hover:bg-[#FFB020]/10 transition"
          title="Wipe lessons + quiz + bundle + promo + assets and re-run the Strategy Agent"
        >
          {regenOpen ? "Hide regen" : "🔁 Regenerate plan"}
        </button>
        <button
          onClick={deletePlan}
          disabled={deleting}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-400/30 text-red-300 hover:bg-red-400/10 disabled:opacity-50 transition"
          title="Delete this week plan and everything under it"
        >
          {deleting ? "Deleting…" : "🗑 Delete plan"}
        </button>
      </div>
      {regenOpen && (
        <div className="px-4 py-3 border-t border-white/5 bg-[#0F1330] space-y-2">
          <textarea
            value={regenIdea}
            onChange={(e) => setRegenIdea(e.target.value)}
            placeholder={`Optional custom idea — e.g. "pivot to RAG benchmarking" or "make lesson 2 a live-coding session on tool use". Leave blank to let the agent re-roll on its own.`}
            rows={3}
            className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#B8C5E0] outline-none focus:border-[#FFB020]/40 resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-[#B8C5E0] flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={regenKeepTheme}
                onChange={(e) => setRegenKeepTheme(e.target.checked)}
                className="accent-[#FFB020]"
              />
              Keep current theme &amp; quiz scope
            </label>
            <PrimaryBtn
              label={regenBusy ? "Regenerating…" : regenKeepTheme ? "🔁 Re-roll lessons" : "🔁 Regenerate plan"}
              busy={regenBusy}
              onClick={regeneratePlan}
            />
            <span className="text-[10px] text-[#6B7799]">
              wipes everything below the plan row · approval re-resets
            </span>
          </div>
        </div>
      )}
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
            <LessonBlock key={l.id} lesson={l} onToast={onToast} onDeleted={reloadPlan} />
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

function LessonBlock({ lesson, onToast, onDeleted }: {
  lesson: Lesson; onToast: (m: string) => void; onDeleted?: () => void;
}) {
  const [script, setScript] = useState<ScriptAsset | null>(null);
  const [ppt, setPpt] = useState<PptAsset | null>(null);
  const [seo, setSeo] = useState<SeoAsset | null>(null);
  const [thumb, setThumb] = useState<ThumbnailAsset | null>(null);
  const [promo, setPromo] = useState<PromoAsset | null>(null);
  const [audio, setAudio] = useState<AudioAsset | null>(null);
  const [busyAudio, setBusyAudio] = useState(false);
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
  const [thumbStyle, setThumbStyle] = useState<"cinematic" | "clean" | "dramatic">("cinematic");
  const [thumbAspect, setThumbAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  // Local copy so a regenerate updates the card in place (title/hook/outline/format).
  const [lsn, setLsn] = useState<Lesson>(lesson);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenNote, setRegenNote] = useState("");

  async function regenerateLesson() {
    setRegenBusy(true);
    onToast("Re-planning this lesson… (Strategy Agent, ~20-40s)");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setRegenBusy(false); return; }
    try {
      const updated = await api<Lesson>(token, `/lessons/${lesson.id}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ guidance: regenNote.trim() || undefined }),
      });
      setLsn(updated);
      // Old assets were wiped server-side — clear them locally too.
      setScript(null); setPpt(null); setSeo(null); setThumb(null); setPromo(null);
      setAudio(null);
      setOpen(false); setOpenSlides(false); setOpenSeo(false);
      setOpenThumb(false); setOpenPromo(false);
      setRegenOpen(false); setRegenNote("");
      onToast(`✓ Lesson re-planned: ${updated.title}`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setRegenBusy(false); }
  }

  async function deleteLesson() {
    if (!confirm(`Delete "${lsn.title}"? This removes the lesson and its generated assets.`)) return;
    setRegenBusy(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setRegenBusy(false); return; }
    try {
      await api(token, `/lessons/${lesson.id}`, { method: "DELETE" });
      onToast("✓ Lesson deleted");
      onDeleted?.();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
      setRegenBusy(false);
    }
  }

  async function generateAudio() {
    if (!script) { onToast("⚠ Generate the script first"); return; }
    setBusyAudio(true);
    onToast("Synthesizing narration… (TTS, ~20-60s)");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusyAudio(false); return; }
    try {
      await api(token, `/lessons/${lesson.id}/audio/generate`, { method: "POST" });
      // Re-fetch to get a fresh presigned URL.
      const au = await api<AudioAsset | null>(token, `/lessons/${lesson.id}/audio`);
      setAudio(au);
      onToast(`✓ Audio ready (${au?.content?.provider ?? "tts"})`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusyAudio(false); }
  }

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
      try {
        const au = await api<AudioAsset | null>(token, `/lessons/${lesson.id}/audio`);
        if (!cancelled && au) setAudio(au);
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
    reqBody?: Record<string, unknown>,
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
        ...(reqBody ? { body: JSON.stringify(reqBody) } : {}),
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
      { style: thumbStyle, aspectRatio: thumbAspect },
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
          🎓 Lesson {lsn.lessonNumber}: {lsn.title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setRegenOpen((v) => !v)}
            disabled={regenBusy}
            className="text-[10px] px-2 py-0.5 rounded-lg border border-amber-400/30 text-amber-300 hover:bg-amber-400/10 disabled:opacity-50 transition"
            title="Replace this lesson with a completely new topic"
          >
            {regenBusy ? "Working…" : "🔄 Regenerate"}
          </button>
          <button
            onClick={deleteLesson}
            disabled={regenBusy}
            className="text-[10px] px-2 py-0.5 rounded-lg border border-red-400/30 text-red-300 hover:bg-red-400/10 disabled:opacity-50 transition"
            title="Delete this lesson"
          >
            🗑 Delete
          </button>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#6B7799]">
            {lsn.status}
          </span>
        </div>
      </div>
      {regenOpen && (
        <div className="px-3 py-2 bg-amber-400/5 border-b border-amber-400/10 space-y-2">
          <p className="text-[10px] text-[#6B7799]">
            Replaces this lesson with a <b>completely new topic</b> (won&apos;t
            overlap the other lesson) and wipes its generated assets. Optional steer:
          </p>
          <input
            type="text"
            value={regenNote}
            onChange={(e) => setRegenNote(e.target.value)}
            placeholder="e.g. less basic, more hands-on code, focus on production pitfalls"
            className="w-full bg-[#0F1330] border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white outline-none focus:border-amber-400/40"
          />
          <div className="flex justify-end gap-2">
            <Btn label="Cancel" onClick={() => { setRegenOpen(false); setRegenNote(""); }} />
            <PrimaryBtn label="🔄 Regenerate lesson" busy={regenBusy} onClick={regenerateLesson} />
          </div>
        </div>
      )}
      <div className="p-3 space-y-2">
        {lsn.hook && (
          <p className="text-[12px] text-[#B8C5E0]">
            <span className="text-[#6B7799]">Hook: </span>{lsn.hook}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#6B7799]">
          <span>{lsn.outline?.length ?? 0} sections</span>
          <span>·</span>
          <FormatSelector key={lsn.lessonFormat} lesson={lsn} onToast={onToast} />
          <span>·</span>
          <ScriptConfigSelector key={`sc-${lsn.id}`} lesson={lsn} onToast={onToast} />
        </div>
        <ul className="space-y-1.5">
          {(lsn.outline ?? []).map((s, i) => (
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
          {script && (
            <VersionsPanel<ScriptAsset>
              lessonId={lesson.id} assetType="script"
              current={script} onToast={onToast} onRolledBack={setScript}
            />
          )}
        </div>
        {script && <CritiqueLine critique={script.critique} />}

        {/* ── Audio narration (TTS) ── */}
        {script && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
            <PrimaryBtn
              label={
                busyAudio
                  ? "Synthesizing…"
                  : audio
                  ? `🔁 Regenerate Audio (v${audio.version + 1})`
                  : "🎙️ Generate Audio"
              }
              busy={busyAudio}
              onClick={generateAudio}
            />
            {audio && (
              <span className="text-[10px] text-[#6B7799]">
                {audio.content?.provider ?? "tts"}
                {audio.content?.durationEstimateSeconds
                  ? ` · ~${Math.round((audio.content.durationEstimateSeconds ?? 0) / 60)} min`
                  : ""}
                {audio.content?.bytes
                  ? ` · ${((audio.content.bytes ?? 0) / 1024 / 1024).toFixed(1)} MB`
                  : ""}
                {audio.content?.costUsd != null
                  ? ` · $${Number(audio.content.costUsd).toFixed(4)}`
                  : ""}
              </span>
            )}
          </div>
        )}
        {audio?.url && (
          <audio controls preload="none" src={audio.url} className="w-full mt-1">
            Your browser does not support audio playback.
          </audio>
        )}

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
              <VersionsPanel<PptAsset>
                lessonId={lesson.id} assetType="ppt"
                current={ppt} onToast={onToast} onRolledBack={setPpt}
              />
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
          {seo && (
            <VersionsPanel<SeoAsset>
              lessonId={lesson.id} assetType="seo"
              current={seo} onToast={onToast} onRolledBack={setSeo}
            />
          )}
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
          <label className="text-[10px] text-[#6B7799] flex items-center gap-1">
            style
            <select
              value={thumbStyle}
              onChange={(e) => setThumbStyle(e.target.value as typeof thumbStyle)}
              className="bg-[#0F1330] border border-white/10 rounded px-1.5 py-1 text-[11px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40"
            >
              <option value="cinematic">🎬 cinematic</option>
              <option value="clean">⬜ clean</option>
              <option value="dramatic">⚡ dramatic</option>
            </select>
          </label>
          <label className="text-[10px] text-[#6B7799] flex items-center gap-1">
            ratio
            <select
              value={thumbAspect}
              onChange={(e) => setThumbAspect(e.target.value as typeof thumbAspect)}
              className="bg-[#0F1330] border border-white/10 rounded px-1.5 py-1 text-[11px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40"
            >
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="9:16">9:16</option>
            </select>
          </label>
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
              {thumb.content?.style ?? "—"} · {thumb.content?.aspectRatio ?? "16:9"} · face: {thumb.content?.facePosition ?? "—"}
              {thumb.content?.costUsd != null ? ` · $${Number(thumb.content.costUsd).toFixed(4)}` : ""}
            </span>
          )}
          {thumb && <QualityBadge q={thumb} />}
          {thumb && (
            <VersionsPanel<ThumbnailAsset>
              lessonId={lesson.id} assetType="thumbnail_prompt"
              current={thumb} onToast={onToast} onRolledBack={setThumb}
            />
          )}
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
          {promo && (
            <VersionsPanel<PromoAsset>
              lessonId={lesson.id} assetType="promo"
              current={promo} onToast={onToast} onRolledBack={setPromo}
            />
          )}
        </div>
        {promo && <CritiqueLine critique={promo.critique} />}
        {openPromo && promo && (
          <div className="space-y-2 text-[12px] text-[#B8C5E0]">
            {promo.content?.linkedin && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#6B7799]">LinkedIn</p>
                <CopyBox
                  label={`Full LinkedIn post · ${(promo.content.linkedin.hashtags ?? []).length} tags`}
                  value={promo.content.linkedin.full_text ?? [
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
                  label={`Caption + tags · ${(promo.content.instagram.hashtags ?? []).length} tags`}
                  value={promo.content.instagram.full_text ??
                    ((promo.content.instagram.caption ?? "") +
                    "\n\n" +
                    (promo.content.instagram.hashtags ?? []).map((h) => `#${h}`).join(" "))
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

        {/* ── Phase D: post-publish intelligence per lesson ────────────────── */}
        <LessonPhaseDPanel lesson={lesson} onToast={onToast} />
      </div>
    </div>
  );
}

function LessonPhaseDPanel({ lesson, onToast }: {
  lesson: Lesson; onToast: (m: string) => void;
}) {
  const [metrics, setMetrics] = useState<LessonMetricsRow | null>(null);
  const [postmortem, setPostmortem] = useState<LessonPostmortemRow | null>(null);
  const [published, setPublished] = useState<PublishedVideoRow | null>(null);
  const [drafts, setDrafts] = useState<CommentDraftsResponse | null>(null);
  const [openDrafts, setOpenDrafts] = useState(false);
  const [openImage, setOpenImage] = useState(false);
  const [openPostmortem, setOpenPostmortem] = useState(false);
  const [openMetrics, setOpenMetrics] = useState(false);
  const [openPublish, setOpenPublish] = useState(false);
  const [videoId, setVideoId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Auto-load all four lazily.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await fetchToken();
      if (!token || cancelled) return;
      try {
        const m = await api<LessonMetricsRow>(token, `/lessons/${lesson.id}/metrics`);
        if (!cancelled) setMetrics(m);
      } catch { /* 404 */ }
      try {
        const p = await api<LessonPostmortemRow>(token, `/lessons/${lesson.id}/postmortem`);
        if (!cancelled) setPostmortem(p);
      } catch { /* 404 */ }
      try {
        const t = await api<PublishedVideoRow>(token, `/lessons/${lesson.id}/thumbnail-image`);
        if (!cancelled) setPublished(t);
      } catch { /* 404 */ }
    })();
    return () => { cancelled = true; };
  }, [lesson.id]);

  async function generatePostmortem() {
    setBusy("postmortem");
    onToast("Generating postmortem… (gpt-4o-mini, ~10-20s)");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const p = await api<LessonPostmortemRow>(
        token, `/lessons/${lesson.id}/postmortem/generate`, { method: "POST" },
      );
      setPostmortem(p); setOpenPostmortem(true);
      onToast("✓ Postmortem ready");
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function generateThumbImage() {
    setBusy("image");
    onToast("Generating thumbnail PNG (DALL-E 3, ~10-30s)…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<PublishedVideoRow>(
        token, `/lessons/${lesson.id}/thumbnail-image/generate`, { method: "POST" },
      );
      setPublished(r); setOpenImage(true);
      onToast(`✓ Thumbnail PNG ready (${r.thumbnailModel})`);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function publish() {
    if (!videoId.trim()) { onToast("⚠ youtubeVideoId required"); return; }
    setBusy("publish");
    onToast("Pushing SEO + thumbnail to YouTube…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<PublishedVideoRow>(
        token, `/lessons/${lesson.id}/publish`,
        { method: "POST", body: JSON.stringify({ youtubeVideoId: videoId.trim() }) },
      );
      setPublished(r);
      onToast(`✓ Published — ${r.youtubeUrl}`);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function loadDrafts() {
    setBusy("comments");
    onToast("Drafting replies for top-level comments…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<CommentDraftsResponse>(
        token, `/lessons/${lesson.id}/comments/drafts`,
      );
      setDrafts(r); setOpenDrafts(true);
      onToast(`✓ ${r.drafts.length} drafts (${r.drafts.filter((d) => d.spam.isSpam).length} spam-flagged)`);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function postReply(parentId: string, text: string) {
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); return; }
    try {
      await api(token, `/lessons/${lesson.id}/comments/post-reply`, {
        method: "POST",
        body: JSON.stringify({ parentCommentId: parentId, text }),
      });
      onToast("✓ Reply posted");
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }

  return (
    <div className="pt-2 border-t border-white/5 space-y-2">
      <p className="text-[10px] text-[#6B7799] uppercase">📡 Phase D — publish + intelligence</p>

      <div className="flex flex-wrap items-center gap-2">
        <Btn
          label={metrics ? `📈 Metrics · ${metrics.views.toLocaleString()} v` : "📈 No metrics yet"}
          onClick={() => setOpenMetrics((v) => !v)}
        />
        <PrimaryBtn
          label={busy === "postmortem" ? "Writing…" : postmortem ? "🔁 Regenerate Postmortem" : "🪞 Generate Postmortem"}
          busy={busy === "postmortem"}
          onClick={generatePostmortem}
        />
        {postmortem && (
          <Btn label={openPostmortem ? "Hide postmortem" : "📖 View postmortem"} onClick={() => setOpenPostmortem((v) => !v)} />
        )}
        <PrimaryBtn
          label={busy === "image" ? "Drawing…" : published?.thumbnailB64 ? "🔁 Regenerate Thumbnail PNG" : "🖼 Generate Thumbnail PNG"}
          busy={busy === "image"}
          onClick={generateThumbImage}
        />
        {published?.thumbnailB64 && (
          <Btn label={openImage ? "Hide image" : "🖼 View PNG"} onClick={() => setOpenImage((v) => !v)} />
        )}
        <Btn label={openPublish ? "Hide publish" : "🎯 Publish to YouTube"} onClick={() => setOpenPublish((v) => !v)} />
        <Btn label={busy === "comments" ? "Drafting…" : "💬 Draft comment replies"} onClick={loadDrafts} />
      </div>

      {openMetrics && (
        <div className="text-[11px] text-[#B8C5E0] border border-white/5 rounded-lg p-2">
          {metrics ? (
            <div className="space-y-0.5">
              <p><b>{metrics.views.toLocaleString()}</b> views · {metrics.likes ?? "—"} likes · {metrics.comments ?? "—"} comments</p>
              {metrics.ctr != null && <p>CTR: {(Number(metrics.ctr) * 100).toFixed(2)}%</p>}
              {metrics.avgViewDurationSec != null && <p>Avg view: {metrics.avgViewDurationSec}s</p>}
              {metrics.retentionPct != null && <p>Retention: {metrics.retentionPct}%</p>}
              {metrics.subscribersGained != null && <p>Subscribers gained: {metrics.subscribersGained}</p>}
              <p className="text-[10px] text-[#6B7799]">fetched {new Date(metrics.fetchedAt).toLocaleString()}</p>
            </div>
          ) : (
            <p className="text-[#6B7799]">
              No metrics yet — publish to YouTube + wait for the hourly cron (or click ▶ Sync now in Intelligence).
            </p>
          )}
        </div>
      )}

      {openPostmortem && postmortem && (
        <div className="text-[11px] text-[#B8C5E0] border border-white/5 rounded-lg p-2 space-y-1.5">
          {(["worked", "didntWork", "next"] as const).map((k) => {
            const list = (postmortem.content[k] ?? []) as string[];
            const label = k === "worked" ? "✓ Worked" : k === "didntWork" ? "✗ Didn't work" : "→ Next time";
            return list.length === 0 ? null : (
              <div key={k}>
                <p className="text-[10px] uppercase text-[#6B7799] mb-0.5">{label}</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {list.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            );
          })}
          {postmortem.content.reusableHookPattern && (
            <p className="text-[#FFB800] text-[11px]">
              <b>Reusable hook pattern:</b> {postmortem.content.reusableHookPattern}
            </p>
          )}
          <p className="text-[10px] text-[#6B7799]">
            {postmortem.modelUsed} · ${Number(postmortem.costUsd).toFixed(4)} · {new Date(postmortem.createdAt).toLocaleString()}
          </p>
        </div>
      )}

      {openImage && published?.thumbnailB64 && (
        <div className="border border-white/5 rounded-lg p-2 space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${published.thumbnailB64}`}
            alt="Generated thumbnail"
            className="rounded-lg max-w-full h-auto border border-white/10"
          />
          <p className="text-[10px] text-[#6B7799]">{published.thumbnailModel}</p>
          <a
            href={`data:image/png;base64,${published.thumbnailB64}`}
            download={`thumbnail-${lesson.lessonNumber}.png`}
            className="text-[10px] text-[#00D4FF] hover:underline"
          >⬇ Download PNG</a>
        </div>
      )}

      {openPublish && (
        <div className="border border-white/5 rounded-lg p-2 space-y-1.5">
          <p className="text-[10px] text-[#6B7799]">
            Upload your video to YouTube manually first, then paste the video id below.
            This sets the SEO title / description / tags and uploads the generated thumbnail.
            Requires <span className="text-[#FFB800]">CS_YT_OAUTH_*</span> envs on the api Deployment.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={videoId} onChange={(e) => setVideoId(e.target.value)}
              placeholder="YouTube videoId (e.g. dQw4w9WgXcQ)"
              className="flex-1 bg-[#0A0E27] border border-white/10 rounded px-2 py-1 text-[12px] text-white"
            />
            <PrimaryBtn label={busy === "publish" ? "Publishing…" : "🎯 Publish"} busy={busy === "publish"} onClick={publish} />
          </div>
          {published?.youtubeUrl && (
            <a href={published.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#00D4FF] hover:underline">
              {published.youtubeUrl}
            </a>
          )}
        </div>
      )}

      {openDrafts && drafts && (
        <div className="border border-white/5 rounded-lg p-2 space-y-1.5">
          <p className="text-[10px] text-[#6B7799]">
            {drafts.drafts.length} comment(s) · {drafts.drafts.filter((d) => d.spam.isSpam).length} flagged spam ·
            {drafts.canPostReplies ? " posting LIVE" : " posting DORMANT (OAuth not set)"}
          </p>
          {drafts.drafts.map((d) => (
            <div key={d.comment.id} className="border border-white/5 rounded-lg p-2 space-y-1 text-[11px]">
              <p>
                <span className="text-[#FFB800] mr-1.5">{d.comment.authorDisplayName}</span>
                <span className="text-[10px] text-[#6B7799]">{new Date(d.comment.publishedAt).toLocaleDateString()}</span>
                {d.spam.isSpam && (
                  <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-300">
                    spam ({(d.spam.confidence * 100).toFixed(0)}%)
                  </span>
                )}
              </p>
              <p className="text-[#B8C5E0]">{d.comment.textOriginal}</p>
              {d.suggestedReply && (
                <>
                  <p className="text-[10px] text-[#6B7799] mt-1">Suggested reply:</p>
                  <p className="text-[#00F5A0] italic">{d.suggestedReply}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => postReply(d.comment.id, d.suggestedReply!)}
                      disabled={!drafts.canPostReplies}
                      className="text-[10px] px-2 py-0.5 rounded border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 disabled:opacity-40 transition"
                    >📤 Post reply</button>
                    <button
                      onClick={() => navigator.clipboard.writeText(d.suggestedReply!)}
                      className="text-[10px] text-[#00D4FF] hover:underline"
                    >Copy</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
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
      {q.confidence != null ? ` · conf ${Number(q.confidence).toFixed(2)}` : ""}
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

function DashboardPanel() {
  const [stats, setStats] = useState<StatsBundle | null>(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const s = await api<StatsBundle>(token, "/stats");
      setStats(s);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="bg-[#151B3D] border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
          📊 Dashboard
          {stats && (
            <span className="ml-2 text-[10px] text-[#6B7799] font-normal normal-case">
              · updated {new Date(stats.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="text-[10px] text-[#6B7799] hover:text-white">refresh</button>
          <button onClick={() => setOpen((v) => !v)} className="text-[10px] text-[#00D4FF] hover:underline">
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {open && (
        loading || !stats ? (
          <p className="text-[12px] text-[#6B7799]">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CostChart rows={stats.costPerWeek} />
            <QualityChart points={stats.qualityTrend} />
            <SuccessChart rows={stats.successRate} />
            <FailuresList rows={stats.topFailures} />
            <MemoryTable rows={stats.memoryPool} />
          </div>
        )
      )}
    </section>
  );
}

function CostChart({ rows }: { rows: { weekStart: string; costUsd: number }[] }) {
  const max = Math.max(0.01, ...rows.map((r) => r.costUsd));
  const total = rows.reduce((s, r) => s + r.costUsd, 0);
  return (
    <div className="border border-white/5 rounded-xl p-3">
      <p className="text-[10px] text-[#6B7799] uppercase">
        Cost per week (last 12) · total ${total.toFixed(2)}
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-[#6B7799] mt-2">No spend yet.</p>
      ) : (
        <div className="flex items-end gap-1 h-24 mt-2">
          {rows.map((r) => (
            <div key={r.weekStart} className="flex-1 flex flex-col items-center gap-1" title={`${r.weekStart} — $${r.costUsd.toFixed(3)}`}>
              <div
                className="w-full bg-[#00D4FF]/70 hover:bg-[#00D4FF] rounded-t"
                style={{ height: `${Math.max(2, (r.costUsd / max) * 90)}%` }}
              />
              <span className="text-[8px] text-[#6B7799] truncate w-full text-center">
                {r.weekStart.slice(5)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QualityChart({ points }: { points: QualityPoint[] }) {
  // Group by assetType.
  const byType = new Map<string, QualityPoint[]>();
  points.forEach((p) => {
    if (!byType.has(p.assetType)) byType.set(p.assetType, []);
    byType.get(p.assetType)!.push(p);
  });
  return (
    <div className="border border-white/5 rounded-xl p-3 space-y-1.5">
      <p className="text-[10px] text-[#6B7799] uppercase">Quality trend per agent</p>
      {byType.size === 0 ? (
        <p className="text-[11px] text-[#6B7799]">No graded assets yet.</p>
      ) : Array.from(byType.entries()).map(([type, series]) => {
        const latest = series[series.length - 1];
        const tone =
          latest.avgScore >= 80 ? "text-emerald-300"
          : latest.avgScore >= 70 ? "text-blue-300"
          : "text-amber-300";
        const max = Math.max(...series.map((s) => s.avgScore));
        const min = Math.min(...series.map((s) => s.avgScore));
        return (
          <div key={type} className="text-[11px] flex items-center gap-2">
            <span className="text-[#B8C5E0] w-20">{type}</span>
            <span className={`font-mono font-semibold w-12 ${tone}`}>
              {Math.round(latest.avgScore)}
            </span>
            <span className="text-[10px] text-[#6B7799] flex-1">
              {series.length} wk · min {Math.round(min)} · max {Math.round(max)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SuccessChart({ rows }: { rows: { agentType: string; success: number; failed: number; total: number; rate: number }[] }) {
  return (
    <div className="border border-white/5 rounded-xl p-3 space-y-1.5">
      <p className="text-[10px] text-[#6B7799] uppercase">Success rate (last 30d)</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-[#6B7799]">No runs yet.</p>
      ) : rows.map((r) => (
        <div key={r.agentType} className="text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-[#B8C5E0]">{r.agentType}</span>
            <span className="text-[#6B7799]">
              {r.success}/{r.total} · {(r.rate * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${(r.rate * 100).toFixed(1)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FailuresList({ rows }: { rows: { error: string; count: number; lastAt: string; agentType: string }[] }) {
  return (
    <div className="border border-white/5 rounded-xl p-3 space-y-1">
      <p className="text-[10px] text-[#6B7799] uppercase">Top failures (last 30d)</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-[#6B7799]">No failures 🎉</p>
      ) : rows.map((r, i) => (
        <div key={i} className="text-[11px] text-[#B8C5E0]">
          <span className="text-[10px] uppercase text-red-300 mr-1.5">{r.agentType}</span>
          <span className="text-red-300/80 mr-1.5">×{r.count}</span>
          <span className="text-[#B8C5E0] break-words">{r.error}</span>
        </div>
      ))}
    </div>
  );
}

function MemoryTable({ rows }: { rows: { agentType: string; applicable: number; total: number }[] }) {
  return (
    <div className="border border-white/5 rounded-xl p-3 space-y-1">
      <p className="text-[10px] text-[#6B7799] uppercase">Memory pool per agent</p>
      {rows.map((r) => (
        <div key={r.agentType} className="text-[11px] flex items-center gap-2">
          <span className="text-[#B8C5E0] w-20">{r.agentType}</span>
          <span className="text-[#6B7799] font-mono">
            {r.applicable} / {r.total}
          </span>
          <span className="text-[10px] text-[#6B7799]">
            ({r.total === 0 ? "no memories" : `${Math.round((r.applicable / r.total) * 100)}%`})
          </span>
        </div>
      ))}
    </div>
  );
}

function AuditPanel() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const token = await fetchToken();
    if (!token) return;
    try {
      const r = await api<{ data: AuditEntry[] }>(token, "/audit?limit=30");
      setItems(r.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (items.length === 0 && !open) return null;

  return (
    <section className="bg-[#151B3D] border border-white/10 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
          📜 Audit log · {items.length} recent
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="text-[10px] text-[#6B7799] hover:text-white">refresh</button>
          <button onClick={() => setOpen((v) => !v)} className="text-[10px] text-[#00D4FF] hover:underline">
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-[12px] text-[#6B7799]">No audit entries yet.</p>
          ) : items.map((a) => (
            <div key={a.id} className="text-[11px] text-[#B8C5E0] flex gap-2 items-start">
              <span className="text-[10px] text-[#6B7799] shrink-0 w-32">
                {new Date(a.createdAt).toLocaleString()}
              </span>
              <span className="text-[10px] uppercase text-[#FFB800] shrink-0 w-24">
                {a.entityType} · {a.action}
              </span>
              <span className="flex-1 break-words">{a.summary ?? "(no summary)"}</span>
              <span className="text-[10px] text-[#6B7799] shrink-0">
                {a.userEmail ?? a.userId?.slice(0, 8) ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Phase D: top-level Intelligence panel + brand-create button ────────────

function IntelligencePanel({ brands, onToast }: {
  brands: Brand[]; onToast: (m: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const [open, setOpen] = useState(true);
  const [openManage, setOpenManage] = useState(false);
  const [topVideos, setTopVideos] = useState<CompetitorVideo[]>([]);
  const [channels, setChannels] = useState<CompetitorChannel[]>([]);
  const [busy, setBusy] = useState(false);
  const [improvement, setImprovement] = useState<{ scanned: number; promoted: number } | null>(null);

  useEffect(() => {
    if (!selected && brands.length > 0) setSelected(brands[0].id);
  }, [brands, selected]);

  const loadFor = useCallback(async (brandId: string) => {
    if (!brandId) return;
    const token = await fetchToken();
    if (!token) return;
    try {
      const [top, list] = await Promise.all([
        api<{ data: CompetitorVideo[] }>(token, `/brands/${brandId}/intelligence/competitor-top?days=30`),
        api<{ data: CompetitorChannel[] }>(token, `/brands/${brandId}/competitors`),
      ]);
      setTopVideos(top.data);
      setChannels(list.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (selected) void loadFor(selected); }, [selected, loadFor]);

  async function syncNow() {
    setBusy(true);
    onToast("Triggering competitor + metrics sweeps…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(false); return; }
    try {
      await api(token, "/intelligence/sync-now", { method: "POST" });
      onToast("✓ Sync queued — refresh in ~1 min");
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  async function runImprovement() {
    setBusy(true);
    onToast("Running Improvement Agent across all brands…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(false); return; }
    try {
      const r = await api<{ scanned: number; promoted: number }>(
        token, "/improvement/run", { method: "POST" },
      );
      setImprovement(r);
      onToast(`✓ Scanned ${r.scanned} brand(s) — promoted ${r.promoted} pattern(s) into BrandMemory`);
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  if (brands.length === 0) return null;
  const brandName = brands.find((b) => b.id === selected)?.name ?? "—";

  return (
    <section className="bg-[#151B3D] border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
          🔭 Intelligence
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
          >
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Btn label="▶ Sync now" onClick={syncNow} />
          <Btn label="🔁 Run Improvement" onClick={runImprovement} />
          <Btn label={openManage ? "Hide channels" : `🛠 Channels (${channels.length})`} onClick={() => setOpenManage((v) => !v)} />
          <button onClick={() => setOpen((v) => !v)} className="text-[10px] text-[#00D4FF] hover:underline">
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {improvement && (
        <p className="text-[11px] text-[#FFB800]">
          Last Improvement run — scanned {improvement.scanned} brand(s), promoted {improvement.promoted} hook pattern(s).
        </p>
      )}

      {openManage && selected && (
        <CompetitorManagePanel
          brandId={selected}
          channels={channels}
          onToast={onToast}
          onChanged={() => void loadFor(selected)}
          busy={busy}
        />
      )}

      {open && (
        <div>
          <p className="text-[10px] text-[#6B7799] uppercase">
            {brandName} · competitor top videos (last 30 days)
          </p>
          {topVideos.length === 0 ? (
            <p className="text-[11px] text-[#6B7799] mt-1">
              No competitor data yet. Add competitor channels above, then click ▶ Sync now.
              (Needs CS_YT_API_KEY bound on the api Deployment.)
            </p>
          ) : (
            <ol className="space-y-1 max-h-72 overflow-y-auto mt-1">
              {topVideos.map((v) => (
                <li key={v.id} className="text-[11px] text-[#B8C5E0] flex items-center gap-2">
                  <span className="text-[10px] text-[#FFB800] w-16 shrink-0 font-mono">
                    {v.viewCount.toLocaleString()} v
                  </span>
                  <span className="text-[10px] text-[#6B7799] w-24 shrink-0">
                    {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : "—"}
                  </span>
                  <span className="flex-1 break-words">{v.title}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function CompetitorManagePanel({
  brandId, channels, onToast, onChanged, busy,
}: {
  brandId: string;
  channels: CompetitorChannel[];
  onToast: (m: string) => void;
  onChanged: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    if (!name.trim() || !handle.trim()) {
      onToast("⚠ name + channel handle required");
      return;
    }
    setAdding(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setAdding(false); return; }
    try {
      const payload = handle.startsWith("UC")
        ? { name: name.trim(), youtubeChannelId: handle.trim() }
        : { name: name.trim(), channelHandle: handle.trim() };
      await api(token, `/brands/${brandId}/competitors`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setName(""); setHandle("");
      onToast("✓ Competitor added");
      onChanged();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setAdding(false); }
  }

  async function sync(cid: string) {
    onToast("Syncing competitor…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); return; }
    try {
      const r = await api<{ saved: number }>(token, `/brands/${brandId}/competitors/${cid}/sync`, { method: "POST" });
      onToast(`✓ ${r.saved} new videos saved`);
      onChanged();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }

  async function remove(cid: string) {
    if (!confirm("Remove this competitor channel?")) return;
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); return; }
    try {
      await api(token, `/brands/${brandId}/competitors/${cid}`, { method: "DELETE" });
      onToast("✓ Competitor removed");
      onChanged();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }

  return (
    <div className="border border-white/5 rounded-xl p-3 space-y-2">
      <p className="text-[10px] text-[#6B7799] uppercase">Manage competitor channels</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Channel name"
          className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white w-44"
        />
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@handle or UCxxx"
          className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white w-48"
        />
        <PrimaryBtn label={adding ? "Adding…" : "➕ Add"} busy={adding} onClick={add} />
      </div>
      {channels.length === 0 ? (
        <p className="text-[11px] text-[#6B7799]">No competitor channels yet.</p>
      ) : (
        <div className="space-y-1">
          {channels.map((c) => (
            <div key={c.id} className="text-[11px] flex items-center gap-2 text-[#B8C5E0]">
              <span className="font-semibold">{c.name}</span>
              <span className="text-[#6B7799]">{c.channelHandle ?? c.youtubeChannelId ?? "—"}</span>
              <span className="text-[10px] text-[#6B7799]">
                {c.lastFetchedAt ? `synced ${new Date(c.lastFetchedAt).toLocaleDateString()}` : "never synced"}
              </span>
              {c.lastError && <span className="text-[10px] text-red-300">⚠ {c.lastError.slice(0, 60)}</span>}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => sync(c.id)}
                  disabled={busy}
                  className="text-[10px] text-[#00D4FF] hover:underline disabled:opacity-40"
                >sync</button>
                <button
                  onClick={() => remove(c.id)}
                  className="text-[10px] text-red-300 hover:underline"
                >remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewBrandButton({ onToast, onCreated }: {
  onToast: (m: string) => void;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [voiceStyle, setVoiceStyle] = useState("");
  const [colorPrimary, setColorPrimary] = useState("#00D4FF");
  const [colorSecondary, setColorSecondary] = useState("#FFB800");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim() || !slug.trim()) {
      onToast("⚠ name + slug required");
      return;
    }
    setBusy(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(false); return; }
    try {
      await api(token, "/brands", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(), slug: slug.trim(),
          description: description.trim() || undefined,
          voiceStyle: voiceStyle.trim() || undefined,
          colorPrimary, colorSecondary,
        }),
      });
      onToast(`✓ Brand "${name.trim()}" created`);
      setName(""); setSlug(""); setDescription(""); setVoiceStyle("");
      setOpen(false);
      onCreated();
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 transition"
      >➕ Add brand</button>
    );
  }
  return (
    <div className="bg-[#151B3D] border border-[#00F5A0]/30 rounded-2xl p-3 space-y-2 w-full">
      <p className="text-[10px] text-[#6B7799] uppercase">Create a new brand</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Stride)"
          className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
        />
        <input
          value={slug} onChange={(e) => setSlug(e.target.value)}
          placeholder="slug (e.g. stride)"
          className="bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
        />
      </div>
      <textarea
        value={description} onChange={(e) => setDescription(e.target.value)}
        rows={2} placeholder="What is this brand about?"
        className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
      />
      <textarea
        value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)}
        rows={2} placeholder="Voice / style summary (used by every agent prompt)"
        className="w-full bg-[#0A0E27] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] text-[#6B7799] flex items-center gap-1.5">
          Primary
          <input type="color" value={colorPrimary} onChange={(e) => setColorPrimary(e.target.value)} className="bg-transparent" />
        </label>
        <label className="text-[10px] text-[#6B7799] flex items-center gap-1.5">
          Secondary
          <input type="color" value={colorSecondary} onChange={(e) => setColorSecondary(e.target.value)} className="bg-transparent" />
        </label>
        <PrimaryBtn label={busy ? "Creating…" : "Create"} busy={busy} onClick={create} />
        <Btn label="Cancel" onClick={() => setOpen(false)} />
      </div>
    </div>
  );
}

function VersionsPanel<T extends { version: number }>({
  lessonId, assetType, current, onToast, onRolledBack,
}: {
  lessonId: string;
  assetType: RollbackableAssetType;
  current: T | null;
  onToast: (m: string) => void;
  onRolledBack: (newAsset: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<AssetVersionMeta[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    const token = await fetchToken();
    if (!token) return;
    try {
      const r = await api<{ data: AssetVersionMeta[] }>(
        token, `/lessons/${lessonId}/assets/${assetType}/versions`,
      );
      setVersions(r.data);
    } catch { setVersions([]); }
  }
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && versions === null) await load();
  }
  async function rollback(version: number) {
    setBusy(version);
    onToast(`Rolling back ${assetType} → v${version}…`);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<T>(
        token, `/lessons/${lessonId}/assets/${assetType}/versions/${version}/rollback`,
        { method: "POST" },
      );
      onToast(`✓ Rolled back ${assetType} to v${version} (created v${r.version})`);
      onRolledBack(r);
      await load();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(null); }
  }

  if (!current) return null;
  return (
    <>
      <Btn
        label={open ? "Hide versions" : "🕘 Versions"}
        onClick={toggle}
      />
      {open && (
        <div className="w-full mt-2 border-t border-white/5 pt-2 space-y-1">
          {versions === null ? (
            <p className="text-[11px] text-[#6B7799]">Loading…</p>
          ) : versions.length <= 1 ? (
            <p className="text-[11px] text-[#6B7799]">No earlier versions — nothing to roll back to.</p>
          ) : versions.map((v) => (
            <div key={v.id} className="text-[11px] flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                v.version === current.version
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-500/15 text-slate-400"
              }`}>
                v{v.version}{v.version === current.version ? " · latest" : ""}
              </span>
              <span className="text-[#6B7799]">
                {v.qualityScore != null ? `score ${v.qualityScore} · ` : ""}
                {v.revisions} rev · {new Date(v.createdAt).toLocaleString()}
              </span>
              {v.version !== current.version && (
                <button
                  onClick={() => rollback(v.version)}
                  disabled={busy === v.version}
                  className="ml-auto px-2 py-0.5 text-[10px] font-semibold rounded-md border border-[#FFB800]/40 text-[#FFB800] hover:bg-[#FFB800]/10 disabled:opacity-40 transition"
                >
                  {busy === v.version ? "Rolling back…" : "↩ Rollback"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
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
  const [bundle, setBundle] = useState<QuizBundleResp | null>(null);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [promo, setPromo] = useState<QuizPromoResp | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [weekBusy, setWeekBusy] = useState(false);
  // Per-lesson regenerate UI state — keyed by lessonNumber.
  const [lessonBusy, setLessonBusy] = useState<number | null>(null);
  const [lessonOpen, setLessonOpen] = useState<number | null>(null);
  const [lessonPrompt, setLessonPrompt] = useState<Record<number, string>>({});
  const [lessonCount, setLessonCount] = useState<Record<number, string>>({});
  // Per-lesson question-type restriction (defaults to inheriting bundleTypes).
  const [lessonTypes, setLessonTypes] = useState<Record<number, Record<"mcq" | "true_false" | "multi_select" | "numeric", boolean>>>({});
  const [promoTab, setPromoTab] = useState<"youtube" | "linkedin" | "instagram" | "wac" | "was" | "lc">("youtube");
  // Quiz week # written into every CSV row. Empty = let the server default
  // (uses the bundle's stored week, then plan.seriesWeekNumber, then 1).
  const [bundleWeek, setBundleWeek] = useState<string>("");
  // Optional week-wide custom guidance applied to next bundle generation.
  const [bundleCustomPrompt, setBundleCustomPrompt] = useState<string>("");
  // Which question types the LLM may produce. Empty / all 4 = no restriction.
  const [bundleTypes, setBundleTypes] = useState<Record<"mcq" | "true_false" | "multi_select" | "numeric", boolean>>({
    mcq: true, true_false: true, multi_select: true, numeric: true,
  });
  const [genBusy, setGenBusy] = useState(false);
  const [drawBusy, setDrawBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("50");
  // Empty = let the server escalate (last+1). A number = explicit override.
  const [toughness, setToughness] = useState<string>("");

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
    try {
      const b = await api<QuizBundleResp | { bundle: null }>(
        token, `/plans/${planId}/quiz/bundle`,
      );
      // GET returns either the full bundle or { bundle: null }.
      if ("id" in b) {
        setBundle(b);
        // Reflect the stored week in the UI so users see what'll be written.
        if (b.quizWeek != null) setBundleWeek(String(b.quizWeek));
      } else {
        setBundle(null);
      }
    } catch { /* ignore */ }
    try {
      const p = await api<QuizPromoResp | { promo: null }>(
        token, `/plans/${planId}/quiz/promo`,
      );
      setPromo("id" in p ? p : null);
    } catch { /* ignore */ }
  }, [planId]);

  useEffect(() => { void reload(); }, [reload]);

  async function generate() {
    const n = Math.max(5, Math.min(100, Number(count) || 50));
    const t = toughness.trim() === "" ? undefined : Math.max(1, Math.min(5, Number(toughness)));
    setGenBusy(true);
    onToast(`Generating ${n} questions${t ? ` @ toughness ${t}` : " (auto-escalating)"} + validation… (~60-120s)`);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setGenBusy(false); return; }
    try {
      const r = await api<{
        generated: number; valid: number; passRate: number; generatorProvider: string;
        count: number; toughness: number;
        distribution: { easy: number; medium: number; hard: number };
      }>(
        token, `/plans/${planId}/quiz/generate`,
        { method: "POST", body: JSON.stringify({ count: n, toughness: t }) },
      );
      // Reflect the toughness the server actually used (so the slider tracks escalation).
      setToughness(String(r.toughness));
      onToast(
        `✓ Pool: ${r.valid}/${r.generated} valid (${Math.round(r.passRate * 100)}%) · ` +
        `toughness ${r.toughness}/5 [${r.distribution.easy}/${r.distribution.medium}/${r.distribution.hard}] · ` +
        `validated by NON-${r.generatorProvider}`,
      );
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

  async function generateBundle() {
    const n = Math.max(5, Math.min(100, Number(count) || 40));
    const t = toughness.trim() === "" ? undefined : Math.max(1, Math.min(5, Number(toughness)));
    const w =
      bundleWeek.trim() === ""
        ? undefined
        : Math.max(1, Math.min(999, Number(bundleWeek)));
    setBundleBusy(true);
    onToast(`Generating Quiz Module bundle (${n} Qs · week ${w ?? "auto"}) … (~30-90s)`);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBundleBusy(false); return; }
    try {
      const cp = bundleCustomPrompt.trim();
      const checkedTypes = (Object.keys(bundleTypes) as (keyof typeof bundleTypes)[])
        .filter((k) => bundleTypes[k]);
      // All 4 checked or none = no restriction → omit the field.
      const typesToSend = checkedTypes.length === 4 || checkedTypes.length === 0
        ? undefined
        : checkedTypes;
      if (typesToSend && typesToSend.length === 0) {
        onToast("⚠ Pick at least one question type"); setBundleBusy(false); return;
      }
      const r = await api<QuizBundleResp>(
        token, `/plans/${planId}/quiz/bundle/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            count: n, toughness: t, quizWeek: w,
            ...(cp ? { customPrompt: cp } : {}),
            ...(typesToSend ? { questionTypes: typesToSend } : {}),
          }),
        },
      );
      setBundle(r);
      setToughness(String(r.toughness));
      if (r.quizWeek != null) setBundleWeek(String(r.quizWeek));
      onToast(
        `✓ Bundle: ${r.questionCount} Qs + tie-breaker · week ${r.quizWeek ?? "?"} · ` +
        `toughness ${r.toughness}/5 · $${r.costUsd.toFixed(4)}`,
      );
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBundleBusy(false); }
  }

  async function regenerateLesson(lessonNumber: number) {
    const promptText = (lessonPrompt[lessonNumber] ?? "").trim();
    const countRaw = lessonCount[lessonNumber];
    const count = countRaw && countRaw.trim() !== ""
      ? Math.max(1, Math.min(40, Number(countRaw)))
      : undefined;
    // Type filter: per-lesson row > bundle-wide default. Empty / all 4 = omit.
    const lTypes = lessonTypes[lessonNumber] ?? bundleTypes;
    const checked = (Object.keys(lTypes) as (keyof typeof lTypes)[])
      .filter((k) => lTypes[k]);
    const typesToSend = checked.length === 4 || checked.length === 0
      ? undefined
      : checked;
    if (typesToSend && typesToSend.length === 0) {
      onToast("⚠ Pick at least one question type"); return;
    }
    setLessonBusy(lessonNumber);
    onToast(`Regenerating Lesson ${lessonNumber} questions${promptText ? " with custom guidance" : ""}…`);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setLessonBusy(null); return; }
    try {
      const r = await api<QuizBundleResp>(
        token,
        `/plans/${planId}/quiz/bundle/lessons/${lessonNumber}/regenerate`,
        {
          method: "POST",
          body: JSON.stringify({
            count,
            customPrompt: promptText || undefined,
            ...(typesToSend ? { questionTypes: typesToSend } : {}),
          }),
        },
      );
      setBundle(r);
      const got = r.questions.filter((q) => q.lessonNumber === lessonNumber).length;
      onToast(`✓ Lesson ${lessonNumber}: ${got} new questions · $${r.costUsd.toFixed(4)} total bundle cost`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setLessonBusy(null); }
  }

  async function saveWeek() {
    if (!bundle) { onToast("⚠ Generate the bundle first"); return; }
    const w = Math.max(1, Math.min(999, Number(bundleWeek) || 1));
    setWeekBusy(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setWeekBusy(false); return; }
    try {
      const r = await api<QuizBundleResp>(
        token, `/plans/${planId}/quiz/bundle`,
        { method: "PATCH", body: JSON.stringify({ quizWeek: w }) },
      );
      setBundle(r);
      onToast(
        `✓ Week saved → ${r.quizWeek}. Promo still references the old week — ` +
        `regenerate promo to flow the new number into the copy.`,
      );
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setWeekBusy(false); }
  }

  async function refreshPromoLinks() {
    setRefreshBusy(true);
    onToast("Re-pulling lesson YouTube URLs into the promo footer…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setRefreshBusy(false); return; }
    try {
      const r = await api<QuizPromoResp>(
        token, `/plans/${planId}/quiz/promo/refresh-links`,
        { method: "POST" },
      );
      setPromo(r);
      const total = r.payload.lesson_links?.length ?? 0;
      const live  = (r.payload.lesson_links ?? []).filter((l) => !!l.youtubeUrl).length;
      onToast(`✓ Footer refreshed · ${live}/${total} lessons have YouTube URLs`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setRefreshBusy(false); }
  }

  async function generatePromo() {
    if (!bundle) { onToast("⚠ Generate the bundle first"); return; }
    setPromoBusy(true);
    onToast("Generating quiz promo posts (schedule + reward + 5 platforms)… (~20-60s)");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setPromoBusy(false); return; }
    try {
      const r = await api<QuizPromoResp>(
        token, `/plans/${planId}/quiz/promo/generate`,
        { method: "POST" },
      );
      setPromo(r);
      onToast(
        `✓ Promo ready · ${r.startsAtLabel} → ${r.endsAtLabel} · 🎁 ${r.rewardLabel} · $${r.costUsd.toFixed(4)}`,
      );
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setPromoBusy(false); }
  }

  async function downloadBundleCsv() {
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); return; }
    onToast("Downloading bundle CSV…");
    try {
      // Honour the UI week field as a download-time override too — so users
      // can re-download for a different quiz_week without regenerating.
      const wQ = bundleWeek.trim() === "" ? "" : `?quizWeek=${Math.max(1, Math.min(999, Number(bundleWeek)))}`;
      const res = await fetch(
        `/api/v1/admin/content-studio/plans/${planId}/quiz/bundle/csv${wQ}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
      }
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^";]+)"?/i.exec(cd);
      const filename = m?.[1] ?? `quiz-bundle.csv`;
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
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-white/5">
          <label className="text-[10px] text-[#6B7799] flex items-center gap-1">
            # questions
            <input
              type="number" min={5} max={100}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-16 bg-[#0F1330] border border-white/10 rounded px-2 py-1 text-[12px] text-white outline-none focus:border-[#00D4FF]/40"
            />
          </label>
          <label className="text-[10px] text-[#6B7799] flex items-center gap-1">
            toughness
            <select
              value={toughness}
              onChange={(e) => setToughness(e.target.value)}
              className="bg-[#0F1330] border border-white/10 rounded px-1.5 py-1 text-[12px] text-white outline-none focus:border-[#00D4FF]/40"
            >
              <option value="">auto (last+1)</option>
              <option value="1">1 · gentle</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 · brutal</option>
            </select>
          </label>
          <span className="text-[9px] text-[#6B7799]">
            higher = more hard Qs + tougher reasoning · each regen escalates unless you pin a level
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryBtn
            label={
              genBusy
                ? "Generating + validating…"
                : totalCount === 0
                ? `📝 Generate Pool (${Math.max(5, Math.min(100, Number(count) || 50))})`
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

        {/* ── Quiz Module bundle (admin Quiz Module CSV upload) ─────────── */}
        <div className="border-t border-white/5 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#B8C5E0] font-semibold">
              📦 Quiz Module Bundle
              <span className="ml-2 text-[10px] font-normal text-[#6B7799]">
                LLM-generated · mixed types · title + description + tie-breaker
              </span>
            </span>
            {bundle && (
              <span className="text-[10px] text-[#6B7799]">
                {bundle.questionCount} Qs · t{bundle.toughness}/5 · ${bundle.costUsd.toFixed(4)}
              </span>
            )}
          </div>

          <textarea
            value={bundleCustomPrompt}
            onChange={(e) => setBundleCustomPrompt(e.target.value)}
            placeholder={`Optional week-wide custom guidance — e.g. "test rate-limit understanding across both lessons" or "make 30% of questions scenario-based". Leave blank for default.`}
            rows={2}
            className="w-full bg-[#0F1330] border border-white/10 rounded px-3 py-1.5 text-[11px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40 resize-y"
          />

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#6B7799]">
            <span className="text-[10px] uppercase tracking-wide">Question types</span>
            {([
              ["mcq",          "MCQ"],
              ["true_false",   "True/False"],
              ["multi_select", "Multi-select"],
              ["numeric",      "Numeric"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1 text-[#B8C5E0]">
                <input
                  type="checkbox"
                  checked={bundleTypes[key]}
                  onChange={(e) =>
                    setBundleTypes((b) => ({ ...b, [key]: e.target.checked }))
                  }
                  className="accent-[#00D4FF]"
                />
                {label}
              </label>
            ))}
            <span className="text-[9px] text-[#6B7799]">
              uncheck a type to skip it · all 4 = default mix
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] text-[#6B7799] flex items-center gap-1">
              quiz week #
              <input
                type="number" min={1} max={999}
                value={bundleWeek}
                onChange={(e) => setBundleWeek(e.target.value)}
                placeholder="auto"
                className="w-16 bg-[#0F1330] border border-white/10 rounded px-2 py-1 text-[12px] text-white outline-none focus:border-[#00D4FF]/40"
              />
            </label>
            {bundle && bundleWeek.trim() !== "" && Number(bundleWeek) !== bundle.quizWeek && (
              <button
                onClick={saveWeek}
                disabled={weekBusy}
                className="px-2 py-1 text-[10px] rounded border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 disabled:opacity-50"
                title="Persist this week # without regenerating the bundle"
              >
                {weekBusy ? "Saving…" : "💾 Save Week"}
              </button>
            )}
            <PrimaryBtn
              label={
                bundleBusy
                  ? "Generating…"
                  : bundle
                  ? "🔁 Regenerate Bundle"
                  : `📝 Generate Bundle (${Math.max(5, Math.min(100, Number(count) || 40))})`
              }
              busy={bundleBusy}
              onClick={generateBundle}
            />
            {bundle && (
              <>
                <Btn label="⬇ Download Quiz Module CSV" onClick={downloadBundleCsv} />
                <Btn
                  label={bundleOpen ? "Hide bundle" : "👀 View bundle"}
                  onClick={() => setBundleOpen((v) => !v)}
                />
              </>
            )}
            <span className="text-[9px] text-[#6B7799]">
              week # is written into every CSV row · change before regenerating to target a different week
            </span>
          </div>

          {/* ── Quiz promo posts ───────────────────────────────────── */}
          {bundle && (
            <div className="border-t border-white/5 pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#B8C5E0] font-semibold">
                  📣 Quiz Promo Posts
                  <span className="ml-2 text-[10px] font-normal text-[#6B7799]">
                    LLM picks start/end + reward · 5 platforms · lesson links + footer baked in
                  </span>
                </span>
                {promo && (
                  <span className="text-[10px] text-[#6B7799]">
                    🎁 {promo.rewardLabel} · ${promo.costUsd.toFixed(4)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PrimaryBtn
                  label={
                    promoBusy
                      ? "Generating posts…"
                      : promo
                      ? "🔁 Regenerate Posts"
                      : "📣 Generate Promo Posts"
                  }
                  busy={promoBusy}
                  onClick={generatePromo}
                />
                {promo && (
                  <>
                    <span className="text-[10px] text-[#B8C5E0]">
                      🗓 {promo.startsAtLabel} → {promo.endsAtLabel}
                    </span>
                    <Btn
                      label={refreshBusy ? "Refreshing…" : "🔄 Refresh lesson URLs"}
                      onClick={refreshPromoLinks}
                    />
                  </>
                )}
              </div>
              {/* Lesson publish status — visible whenever a promo exists. */}
              {promo && (promo.payload.lesson_links?.length ?? 0) > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
                  <div className="text-[10px] text-[#6B7799] uppercase tracking-wide mb-1">
                    Lesson publish status
                  </div>
                  <ul className="text-[11px] space-y-0.5">
                    {(promo.payload.lesson_links ?? []).map((l) => (
                      <li key={l.lessonNumber} className="flex items-center gap-2 text-[#B8C5E0]">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded ${
                            l.youtubeUrl
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {l.youtubeUrl ? "✓ on YT" : "⏳ unpublished"}
                        </span>
                        <span className="text-[#6B7799]">L{l.lessonNumber}:</span>
                        <span className="truncate">{l.title}</span>
                        {l.youtubeUrl && (
                          <a
                            href={l.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto text-[10px] text-[#00D4FF] hover:underline"
                          >
                            open ↗
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[9px] text-[#6B7799] mt-1.5">
                    Unpublished lessons appear in the footer without a link.
                    Publish them, then hit Refresh lesson URLs to pick them up
                    — no LLM regen needed.
                  </p>
                </div>
              )}
              {promo && (
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ["youtube",   "▶ YouTube"],
                      ["linkedin",  "💼 LinkedIn"],
                      ["instagram", "📸 Instagram"],
                      ["wac",       "💬 WA Channel"],
                      ["was",       "📱 WA Status"],
                      ["lc",        "⏰ Last chance"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setPromoTab(key as typeof promoTab)}
                        className={`px-2 py-1 text-[10px] rounded ${
                          promoTab === key
                            ? "bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40"
                            : "bg-white/5 text-[#B8C5E0] border border-white/10 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    let text = "";
                    if (promoTab === "youtube") {
                      const yt = promo.payload.youtube_community;
                      text = yt ? `TITLE: ${yt.title}\n\n${yt.full_text}` : "";
                    } else if (promoTab === "linkedin") {
                      text = promo.payload.linkedin?.full_text ?? "";
                    } else if (promoTab === "instagram") {
                      text = promo.payload.instagram?.full_text ?? "";
                    } else if (promoTab === "wac") {
                      text = promo.payload.whatsapp_channel?.full_text ?? "";
                    } else if (promoTab === "was") {
                      text = promo.payload.whatsapp_status?.full_text ?? "";
                    } else {
                      text = promo.payload.last_chance?.full_text ?? "";
                    }
                    return (
                      <>
                        <pre className="text-[11px] text-[#B8C5E0] whitespace-pre-wrap break-words max-h-72 overflow-y-auto bg-[#0F1330] rounded p-2 border border-white/5">
                          {text || "(no content for this platform)"}
                        </pre>
                        <Btn
                          label="📋 Copy to clipboard"
                          onClick={() => {
                            navigator.clipboard.writeText(text);
                            onToast(`⬇ ${promoTab.toUpperCase()} text copied`);
                          }}
                        />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {bundle && bundleOpen && (
            <div className="space-y-2 text-[11px] text-[#B8C5E0] bg-white/[0.02] border border-white/5 rounded-lg p-2">
              <div>
                <span className="text-[#6B7799] uppercase tracking-wide text-[9px]">
                  Title
                </span>
                <div className="font-semibold">{bundle.title}</div>
              </div>
              <div>
                <span className="text-[#6B7799] uppercase tracking-wide text-[9px]">
                  Description
                </span>
                <div className="whitespace-pre-line text-[#B8C5E0]/90">
                  {bundle.description}
                </div>
              </div>
              <div>
                <span className="text-[#6B7799] uppercase tracking-wide text-[9px]">
                  Tie-breaker
                </span>
                <div className="text-[#B8C5E0]/90">
                  {bundle.tieBreaker.question}
                  <span className="ml-2 text-[#FFB800]">
                    → {bundle.tieBreaker.answer}
                    {bundle.tieBreaker.unit ? ` ${bundle.tieBreaker.unit}` : ""}
                    {bundle.tieBreaker.tolerance > 0 ? ` ±${bundle.tieBreaker.tolerance}` : ""}
                  </span>
                </div>
              </div>
              {/* Group by lesson — each group has its own regenerate button. */}
              <div className="max-h-[420px] overflow-y-auto space-y-3 border-t border-white/5 pt-2">
                {(() => {
                  // Build [lessonNumber, questions[]] tuples, preserving
                  // order: known lessons first, then "unassigned" (null).
                  const groups = new Map<number | null, typeof bundle.questions>();
                  for (const q of bundle.questions) {
                    const key = q.lessonNumber;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(q);
                  }
                  const entries = Array.from(groups.entries()).sort((a, b) => {
                    const al = a[0] ?? 999;
                    const bl = b[0] ?? 999;
                    return al - bl;
                  });
                  return entries.map(([lessonNum, qs]) => {
                    const heading = lessonNum != null
                      ? `Lesson ${lessonNum}${qs[0]?.category ? ` — ${qs[0].category}` : ""}`
                      : "Unassigned (pre-migration questions)";
                    const isOpen = lessonOpen === lessonNum;
                    const isBusy = lessonBusy === lessonNum;
                    return (
                      <div key={String(lessonNum)} className="border border-white/5 rounded-md">
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-white/[0.03]">
                          <span className="text-[11px] text-[#B8C5E0] font-semibold truncate">
                            {heading}
                            <span className="ml-2 text-[10px] font-normal text-[#6B7799]">
                              {qs.length} Q · {qs.reduce((s, q) => s + q.points, 0)} pt
                            </span>
                          </span>
                          {lessonNum != null && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setLessonOpen(isOpen ? null : lessonNum)}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-[#B8C5E0] hover:text-white hover:bg-white/5"
                              >
                                {isOpen ? "✕" : "✏️ Edit & regen"}
                              </button>
                            </div>
                          )}
                        </div>
                        {isOpen && lessonNum != null && (
                          <div className="p-2 space-y-1.5 border-t border-white/5 bg-[#0F1330]/40">
                            <textarea
                              value={lessonPrompt[lessonNum] ?? ""}
                              onChange={(e) =>
                                setLessonPrompt((m) => ({ ...m, [lessonNum]: e.target.value }))
                              }
                              placeholder={`Optional custom guidance — e.g. "focus on OAuth scopes" or "add a question about rate limits". Leave blank to just re-roll the questions.`}
                              rows={3}
                              className="w-full bg-[#0F1330] border border-white/10 rounded px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#00D4FF]/40 resize-y"
                            />
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#6B7799]">
                              <span className="uppercase tracking-wide">Types</span>
                              {([
                                ["mcq",          "MCQ"],
                                ["true_false",   "True/False"],
                                ["multi_select", "Multi-select"],
                                ["numeric",      "Numeric"],
                              ] as const).map(([key, label]) => {
                                const current =
                                  lessonTypes[lessonNum]?.[key] ??
                                  bundleTypes[key];
                                return (
                                  <label key={key} className="flex items-center gap-1 text-[#B8C5E0]">
                                    <input
                                      type="checkbox"
                                      checked={current}
                                      onChange={(e) =>
                                        setLessonTypes((m) => ({
                                          ...m,
                                          [lessonNum]: {
                                            ...(m[lessonNum] ?? bundleTypes),
                                            [key]: e.target.checked,
                                          },
                                        }))
                                      }
                                      className="accent-[#00D4FF]"
                                    />
                                    {label}
                                  </label>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-[#6B7799] flex items-center gap-1">
                                # questions
                                <input
                                  type="number" min={1} max={40}
                                  value={lessonCount[lessonNum] ?? String(qs.length)}
                                  onChange={(e) =>
                                    setLessonCount((m) => ({ ...m, [lessonNum]: e.target.value }))
                                  }
                                  className="w-14 bg-[#0F1330] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-[#00D4FF]/40"
                                />
                              </label>
                              <PrimaryBtn
                                label={isBusy ? "Regenerating…" : "🔁 Regenerate this lesson"}
                                busy={isBusy}
                                onClick={() => regenerateLesson(lessonNum)}
                              />
                              <span className="text-[9px] text-[#6B7799]">
                                Replaces only this lesson&apos;s questions · other lessons stay intact
                              </span>
                            </div>
                          </div>
                        )}
                        <ul className="px-2 py-1.5 space-y-0.5">
                          {qs.map((q) => (
                            <li key={q.position} className="text-[11px]">
                              <span className="text-[10px] uppercase mr-1.5 text-[#00D4FF]">
                                {q.questionType}
                              </span>
                              <span className="text-[10px] uppercase mr-1.5 text-[#6B7799]">
                                {q.difficulty} · {q.points}pt
                              </span>
                              {q.position}. {q.questionText}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ── Quiz Winners (post-quiz announcement) ─────────────────── */}
        <QuizWinnersSection planId={planId} onToast={onToast} />
      </div>
    </div>
  );
}

// ── Quiz Winners section ────────────────────────────────────────────────────
function QuizWinnersSection({ planId, onToast }: {
  planId: string; onToast: (m: string) => void;
}) {
  const [winners, setWinners] = useState<QuizWinnerResp | null>(null);
  const [busy, setBusy] = useState<"load" | "generate" | "posts" | "thumbs" | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [winnersJson, setWinnersJson] = useState(
    JSON.stringify(
      [
        { rank: 1, name: "", score: 9, maxScore: 9, timeSeconds: 22, prizeInr: 500 },
        { rank: 2, name: "", score: 9, maxScore: 9, timeSeconds: 29, prizeInr: 300 },
        { rank: 3, name: "", score: 9, maxScore: 9, timeSeconds: 35, prizeInr: 200 },
      ],
      null, 2,
    ),
  );
  const [totalParticipants, setTotalParticipants] = useState("");
  const [speedHighlight, setSpeedHighlight] = useState("");
  const [tab, setTab] = useState<"yt" | "ig" | "li" | "wac" | "was">("yt");

  const load = useCallback(async () => {
    setBusy("load");
    const token = await fetchToken();
    if (!token) { setBusy(null); return; }
    try {
      const r = await api<QuizWinnerResp | { winners: null }>(
        token, `/plans/${planId}/quiz/winners`,
      );
      if ("id" in r) setWinners(r);
      else setWinners(null);
    } catch { /* ignore */ }
    finally { setBusy(null); }
  }, [planId]);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    let parsedWinners: unknown;
    try { parsedWinners = JSON.parse(winnersJson); }
    catch (e) { onToast(`⚠ Invalid winners JSON: ${(e as Error).message}`); return; }
    if (!Array.isArray(parsedWinners) || parsedWinners.length === 0) {
      onToast("⚠ winners must be a non-empty array"); return;
    }
    setBusy("generate");
    onToast("Generating winner posts + thumbnails… (~20-40s)");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<QuizWinnerResp>(
        token, `/plans/${planId}/quiz/winners/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            winners: parsedWinners,
            ...(totalParticipants.trim() ? { totalParticipants: Number(totalParticipants) } : {}),
            ...(speedHighlight.trim() ? { speedHighlight: speedHighlight.trim() } : {}),
          }),
        },
      );
      setWinners(r);
      setShowInput(false);
      onToast(
        `✓ Winners ready · ${r.winners.length} winners · ` +
        `$${(Number(r.postsCostUsd) + Number(r.thumbnailsCostUsd)).toFixed(4)}`,
      );
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(null); }
  }

  async function regenPosts() {
    setBusy("posts");
    onToast("Re-rolling winner posts…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<QuizWinnerResp>(
        token, `/plans/${planId}/quiz/winners/regenerate-posts`,
        { method: "POST" },
      );
      setWinners(r);
      onToast("✓ Posts regenerated");
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function regenThumbs() {
    setBusy("thumbs");
    onToast("Re-rolling winner thumbnails…");
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return; }
    try {
      const r = await api<QuizWinnerResp>(
        token, `/plans/${planId}/quiz/winners/regenerate-thumbnails`,
        { method: "POST" },
      );
      setWinners(r);
      onToast("✓ Thumbnails regenerated");
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  const tabText = (() => {
    const p = winners?.posts;
    if (!p) return "";
    if (tab === "yt") return p.youtube_community ?? "";
    if (tab === "ig") return p.instagram?.full_text ?? "";
    if (tab === "li") return p.linkedin?.full_text ?? "";
    if (tab === "wac") return p.whatsapp_channel ?? "";
    return p.whatsapp_status ?? "";
  })();

  return (
    <div className="border-t border-white/5 pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-[#B8C5E0] font-semibold">
          🏆 Quiz Winners
          <span className="ml-2 text-[10px] font-normal text-[#6B7799]">
            after-quiz announcement · 5 platforms + 3 thumbnail prompts
          </span>
        </span>
        {winners && (
          <span className="text-[10px] text-[#6B7799]">
            #{winners.quizNumber} · {winners.winners.length} winners ·
            ${(Number(winners.postsCostUsd) + Number(winners.thumbnailsCostUsd)).toFixed(4)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PrimaryBtn
          label={
            busy === "generate"
              ? "Generating…"
              : winners
              ? "🔁 Replace winners + regen all"
              : "📝 Enter winners + Generate"
          }
          busy={busy === "generate"}
          onClick={() => setShowInput((v) => !v)}
        />
        {winners && (
          <>
            <Btn
              label={busy === "posts" ? "…" : "🔁 Regen posts"}
              onClick={regenPosts}
            />
            <Btn
              label={busy === "thumbs" ? "…" : "🔁 Regen thumbnails"}
              onClick={regenThumbs}
            />
          </>
        )}
      </div>

      {showInput && (
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 space-y-1.5">
          <p className="text-[10px] text-[#6B7799] uppercase tracking-wide">
            Winners JSON (rank, name, score, maxScore, timeSeconds, prizeInr)
          </p>
          <textarea
            value={winnersJson}
            onChange={(e) => setWinnersJson(e.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full bg-[#0F1330] border border-white/10 rounded px-2 py-1.5 text-[11px] text-[#B8C5E0] font-mono outline-none focus:border-[#00D4FF]/40 resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] text-[#6B7799] flex items-center gap-1">
              total participants
              <input
                type="number" min={0}
                value={totalParticipants}
                onChange={(e) => setTotalParticipants(e.target.value)}
                className="w-16 bg-[#0F1330] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-[#00D4FF]/40"
              />
            </label>
            <input
              type="text"
              value={speedHighlight}
              onChange={(e) => setSpeedHighlight(e.target.value)}
              placeholder='Speed highlight — e.g. "22s for 9 questions — fastest ever"'
              className="flex-1 min-w-[200px] bg-[#0F1330] border border-white/10 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-[#00D4FF]/40"
            />
            <PrimaryBtn
              label={busy === "generate" ? "Generating…" : "📝 Generate"}
              busy={busy === "generate"}
              onClick={generate}
            />
          </div>
        </div>
      )}

      {winners?.posts && (
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              ["yt",  "▶ YouTube"],
              ["ig",  "📸 Instagram"],
              ["li",  "💼 LinkedIn"],
              ["wac", "💬 WA Channel"],
              ["was", "📱 WA Status"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key as typeof tab)}
                className={`px-2 py-1 text-[10px] rounded ${
                  tab === key
                    ? "bg-[#FFB020]/20 text-[#FFB020] border border-[#FFB020]/40"
                    : "bg-white/5 text-[#B8C5E0] border border-white/10 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <pre className="text-[11px] text-[#B8C5E0] whitespace-pre-wrap break-words max-h-72 overflow-y-auto bg-[#0F1330] rounded p-2 border border-white/5">
            {tabText || "(no content for this platform)"}
          </pre>
          <Btn
            label="📋 Copy to clipboard"
            onClick={() => {
              navigator.clipboard.writeText(tabText);
              onToast(`⬇ ${tab.toUpperCase()} text copied`);
            }}
          />
        </div>
      )}

      {winners?.thumbnailPrompts && winners.thumbnailPrompts.length > 0 && (
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 space-y-1.5">
          <p className="text-[10px] text-[#6B7799] uppercase tracking-wide">
            🖼 Winner thumbnail prompts (paste into ChatGPT/DALL-E)
          </p>
          {winners.thumbnailPrompts.map((t, i) => (
            <div key={i} className="border border-white/5 rounded p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#B8C5E0]">
                  {t.style} · {t.headline}
                </span>
                <span className="text-[10px] text-[#6B7799]">CTR ~{t.estimatedCtrScore}/100</span>
              </div>
              {t.reasoning && (
                <p className="text-[10px] text-[#6B7799] italic">{t.reasoning}</p>
              )}
              <pre className="text-[11px] text-[#B8C5E0] whitespace-pre-wrap break-words bg-[#0F1330] rounded p-1.5 border border-white/5">
                {t.prompt}
              </pre>
              <Btn
                label="📋 Copy prompt"
                onClick={() => {
                  navigator.clipboard.writeText(t.prompt);
                  onToast(`⬇ ${t.style} prompt copied`);
                }}
              />
            </div>
          ))}
        </div>
      )}
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

// ── Own-channel back catalog ───────────────────────────────────────────────

function ChannelPanel({ brands, onToast }: {
  brands: Brand[]; onToast: (m: string) => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [handle, setHandle] = useState("");
  const [data, setData] = useState<ChannelVideosResp | null>(null);
  const [busy, setBusy] = useState<"sync" | "mine" | "save" | null>(null);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    const token = await fetchToken();
    if (!token) return;
    try { setData(await api<ChannelVideosResp>(token, `/brands/${id}/channel/videos`)); }
    catch { setData(null); }
  }, []);

  useEffect(() => { if (brandId) void load(brandId); }, [brandId, load]);

  async function call(path: string, busyKey: "sync" | "mine" | "save", body?: object): Promise<unknown> {
    setBusy(busyKey);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(null); return null; }
    try {
      const r = await api(token, path, { method: body ? "PATCH" : "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      return r;
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); return null; }
    finally { setBusy(null); }
  }

  async function saveHandle() {
    if (!handle.trim()) return onToast("⚠ Enter a @handle or channel ID");
    const r = await call(`/brands/${brandId}/channel`, "save", { handle: handle.trim() });
    if (r) onToast("✓ Channel handle saved — now Sync");
  }
  async function sync() {
    const r = await call(`/brands/${brandId}/channel/sync`, "sync") as { saved?: number } | null;
    if (r) { onToast(`✓ Synced — ${r.saved ?? 0} new/updated videos`); void load(brandId); }
  }
  async function mine() {
    const r = await call(`/brands/${brandId}/channel/mine`, "mine") as { promoted?: number } | null;
    if (r) onToast(`✓ Mined back catalog — promoted ${r.promoted ?? 0} winning pattern(s) into BrandMemory`);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
        📺 Your channel (back catalog)
      </h2>
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="bg-[#0F1330] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          >
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@aetherstackai or UC… channel ID"
            className="flex-1 min-w-[180px] bg-[#0F1330] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          />
          <Btn label={busy === "save" ? "…" : "Save handle"} onClick={saveHandle} />
          <PrimaryBtn label="🔄 Sync back catalog" busy={busy === "sync"} onClick={sync} />
          <Btn label={busy === "mine" ? "Mining…" : "🧠 Mine winning patterns"} onClick={mine} />
        </div>

        {data && (
          <p className="text-[11px] text-[#6B7799]">
            {data.count} video(s) ingested. Top performers feed the Strategy agent;
            “Mine” extracts winning patterns into BrandMemory.
          </p>
        )}
        {data && data.top.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] uppercase text-[#6B7799]">Top by views</p>
            {data.top.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-[#B8C5E0] truncate">{v.title}</span>
                <span className="text-[#00D4FF] text-[11px] shrink-0">
                  {Math.round(Number(v.viewCount ?? 0) / 1000)}k views
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#6B7799]">
            No videos yet. Set your channel handle (e.g. @aetherstackai) → Save → Sync.
          </p>
        )}
      </div>
    </section>
  );
}

// ── Phase E: Series UI ─────────────────────────────────────────────────────

function FormatSelector({ lesson, onToast }: {
  lesson: Lesson; onToast: (m: string) => void;
}) {
  const [fmt, setFmt] = useState<LessonFormat>(lesson.lessonFormat ?? "lecture");
  const [busy, setBusy] = useState(false);

  async function save(next: LessonFormat) {
    if (next === fmt) return;
    setBusy(true);
    const prev = fmt;
    setFmt(next);
    const token = await fetchToken();
    if (!token) { setFmt(prev); setBusy(false); return; }
    try {
      await api(token, `/lessons/${lesson.id}/format`, {
        method: "PATCH",
        body: JSON.stringify({ lessonFormat: next }),
      });
      onToast(`✓ Lesson format → ${next}`);
    } catch (e) {
      setFmt(prev);
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span>format:</span>
      <select
        value={fmt}
        disabled={busy}
        onChange={(e) => void save(e.target.value as LessonFormat)}
        className="bg-[#0F1330] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40"
      >
        {LESSON_FORMATS.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
    </span>
  );
}

/**
 * Mode + duration picker for the script agent. Mode toggles whether the
 * agent produces pure narration ('inline') or narration + screen-cue array
 * ('with_screen_recording'). Duration drives the target minutes the prompt
 * tells the LLM to hit.
 */
function ScriptConfigSelector({ lesson, onToast }: {
  lesson: Lesson; onToast: (m: string) => void;
}) {
  const [mode, setMode] = useState<"inline" | "with_screen_recording">(
    lesson.explanationMode ?? "inline",
  );
  const [duration, setDuration] = useState<string>(String(lesson.targetDurationMinutes ?? 10));
  const [busy, setBusy] = useState(false);
  const dirty =
    mode !== (lesson.explanationMode ?? "inline") ||
    Number(duration) !== lesson.targetDurationMinutes;

  async function save() {
    setBusy(true);
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      const n = Math.max(1, Math.min(60, Number(duration) || lesson.targetDurationMinutes));
      await api(token, `/lessons/${lesson.id}/script-config`, {
        method: "PATCH",
        body: JSON.stringify({ explanationMode: mode, targetDurationMinutes: n }),
      });
      onToast(`✓ Script config saved — ${n}min · ${mode}`);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span>mode:</span>
      <select
        value={mode}
        disabled={busy}
        onChange={(e) => setMode(e.target.value as typeof mode)}
        className="bg-[#0F1330] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40"
      >
        <option value="inline">inline</option>
        <option value="with_screen_recording">with screen recording</option>
      </select>
      <input
        type="number" min={1} max={60}
        value={duration}
        disabled={busy}
        onChange={(e) => setDuration(e.target.value)}
        className="w-12 bg-[#0F1330] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40"
        title="Target duration (min)"
      />
      <span>min</span>
      {dirty && (
        <button
          onClick={save}
          disabled={busy}
          className="ml-1 px-1.5 py-0.5 text-[10px] rounded border border-[#00F5A0]/40 text-[#00F5A0] hover:bg-[#00F5A0]/10 disabled:opacity-50"
        >
          {busy ? "…" : "💾"}
        </button>
      )}
    </span>
  );
}

function SeriesPanel({ brands, onToast, onChange }: {
  brands: Brand[]; onToast: (m: string) => void; onChange: () => void;
}) {
  const [series, setSeries] = useState<ContentSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const r = await api<ContentSeries[]>(token, "/series");
      setSeries(r);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
          📚 Series (multi-week)
        </h2>
        <Btn
          label={open ? "Hide form" : "➕ New series"}
          onClick={() => setOpen((v) => !v)}
        />
      </div>
      {open && (
        <NewSeriesForm
          brands={brands}
          onToast={onToast}
          onCreated={() => { void load(); onChange(); setOpen(false); }}
        />
      )}
      {loading ? (
        <Loading />
      ) : series.length === 0 ? (
        <Empty>
          No series yet. Click ➕ New series to design a multi-week arc
          (RAG fundamentals, Building agents, etc.) with the Series Architect.
        </Empty>
      ) : (
        series.map((s) => (
          <SeriesCard
            key={s.id}
            series={s}
            brands={brands}
            onToast={onToast}
            onChange={() => { void load(); onChange(); }}
          />
        ))
      )}
    </section>
  );
}

function NewSeriesForm({ brands, onToast, onCreated }: {
  brands: Brand[]; onToast: (m: string) => void; onCreated: () => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [targetWeeks, setTargetWeeks] = useState("4");
  const [startWeekOf, setStartWeekOf] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!brandId) return onToast("⚠ Pick a brand");
    if (!name.trim()) return onToast("⚠ Name required");
    setBusy(true);
    onToast("Series Architect designing the arc… (Claude, ~20-40s)");
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      await api(token, "/series", {
        method: "POST",
        body: JSON.stringify({
          brandId,
          name: name.trim(),
          goal: goal.trim() || undefined,
          targetWeeks: Number(targetWeeks) || 4,
          startWeekOf: startWeekOf || undefined,
        }),
      });
      setName(""); setGoal("");
      onToast("✓ Series created and arc designed");
      onCreated();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-[#0F1330] border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-[11px] text-[#6B7799] space-y-1">
          <span>Brand</span>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          >
            <option value="">— select brand —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-[#6B7799] space-y-1">
          <span>Series name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. RAG from zero to production"
            className="w-full bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          />
        </label>
        <label className="text-[11px] text-[#6B7799] space-y-1 sm:col-span-2">
          <span>Goal (optional — what should viewers be able to do at the end?)</span>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Ship a production RAG system that beats keyword search"
            className="w-full bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          />
        </label>
        <label className="text-[11px] text-[#6B7799] space-y-1">
          <span>Target weeks (2-16)</span>
          <input
            type="number" min={2} max={16}
            value={targetWeeks}
            onChange={(e) => setTargetWeeks(e.target.value)}
            className="w-full bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          />
        </label>
        <label className="text-[11px] text-[#6B7799] space-y-1">
          <span>Start week (YYYY-MM-DD, Monday — blank = this week)</span>
          <input
            type="date"
            value={startWeekOf}
            onChange={(e) => setStartWeekOf(e.target.value)}
            className="w-full bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          />
        </label>
      </div>
      <div className="flex justify-end">
        <PrimaryBtn label="📐 Design arc" onClick={submit} busy={busy} />
      </div>
    </div>
  );
}

const APPROVAL_COLOR: Record<string, string> = {
  pending:  "bg-amber-500/20 text-amber-300",
  approved: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-red-500/20 text-red-300",
};

const STATUS_COLOR_SERIES: Record<string, string> = {
  planning:  "bg-slate-500/20 text-slate-300",
  active:    "bg-emerald-500/20 text-emerald-300",
  completed: "bg-violet-500/20 text-violet-300",
  paused:    "bg-amber-500/20 text-amber-300",
};

function SeriesCard({ series, brands, onToast, onChange }: {
  series: ContentSeries;
  brands: Brand[];
  onToast: (m: string) => void;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<SeriesDetail | null>(null);
  const [busyPlan, setBusyPlan] = useState(false);
  const [busyRedesign, setBusyRedesign] = useState(false);
  const [editing, setEditing] = useState(false);
  const brandName = brands.find((b) => b.id === series.brandId)?.name ?? "—";

  async function reloadFull() {
    const token = await fetchToken();
    if (!token) return;
    try { setFull(await api<SeriesDetail>(token, `/series/${series.id}`)); }
    catch { /* ignore */ }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !full) {
      const token = await fetchToken();
      if (!token) return;
      try { setFull(await api<SeriesDetail>(token, `/series/${series.id}`)); }
      catch (e) { onToast(`⚠ ${(e as Error).message}`); }
    }
  }

  async function planAll() {
    setBusyPlan(true);
    onToast(`Materialising ${series.targetWeeks} weeks… (Strategy Agent per week)`);
    const token = await fetchToken();
    if (!token) { setBusyPlan(false); return; }
    try {
      const r = await api<SeriesPlanAllResponse>(token, `/series/${series.id}/plan-all`, {
        method: "POST",
      });
      onToast(`✓ ${r.plansCreated.length} weekly plans now exist for this series`);
      onChange();
      // refresh detail
      try { setFull(await api<SeriesDetail>(token, `/series/${series.id}`)); }
      catch { /* ignore */ }
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusyPlan(false); }
  }

  async function redesign() {
    if (!confirm("Re-run the Series Architect? This overwrites the topic arc.")) return;
    setBusyRedesign(true);
    onToast("Series Architect redesigning the arc…");
    const token = await fetchToken();
    if (!token) { setBusyRedesign(false); return; }
    try {
      await api(token, `/series/${series.id}/redesign`, { method: "POST" });
      onToast("✓ Arc redesigned");
      setFull(null);
      setOpen(false);
      onChange();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusyRedesign(false); }
  }

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-[#B8C5E0] text-sm font-medium truncate flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR_SERIES[series.status] ?? ""}`}>
            {series.status}
          </span>
          {brandName} · {series.name}
        </span>
        <span className="text-[#6B7799] text-xs shrink-0">
          {series.targetWeeks} weeks
          {series.startWeekOf ? ` · starts ${series.startWeekOf}` : ""}
        </span>
      </div>
      {series.goal && (
        <p className="px-4 pb-2 text-[#B8C5E0] text-[13px]">
          <span className="text-[#6B7799]">Goal: </span>{series.goal}
        </p>
      )}
      <div className="px-4 py-2 border-t border-white/5 flex flex-wrap items-center gap-2">
        <Btn label={open ? "Hide arc" : "📂 Open arc"} onClick={toggle} />
        <PrimaryBtn label="🪄 Plan all weeks" onClick={planAll} busy={busyPlan} />
        {open && full && !editing && (
          <Btn label="✏️ Edit arc" onClick={() => setEditing(true)} />
        )}
        <Btn label={busyRedesign ? "…" : "♻ Redesign"} onClick={redesign} />
      </div>
      {open && full && editing && (
        <div className="px-4 py-4 border-t border-white/5 bg-[#0F1330]">
          <ArcEditor
            seriesId={series.id}
            initial={full.topicArc ?? []}
            onToast={onToast}
            onCancel={() => setEditing(false)}
            onSaved={async () => { setEditing(false); await reloadFull(); onChange(); }}
          />
        </div>
      )}
      {open && full && !editing && (
        <div className="px-4 py-4 border-t border-white/5 bg-[#0F1330] space-y-3">
          {(full.topicArc ?? []).map((w) => (
            <div key={w.weekIndex} className="border border-white/10 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#00D4FF] text-[12px] font-semibold">
                  Week {w.weekIndex} · {w.plannedTheme}
                </span>
                <span className="text-[10px] text-[#6B7799]">
                  {(w.plannedLessonFormats ?? []).join(" + ")}
                </span>
              </div>
              {w.plannedHook && (
                <p className="text-[12px] text-[#B8C5E0]">
                  <span className="text-[#6B7799]">Hook: </span>{w.plannedHook}
                </p>
              )}
              {w.plannedFocus && (
                <p className="text-[11px] text-[#6B7799]">{w.plannedFocus}</p>
              )}
            </div>
          ))}
          {full.plans && full.plans.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <p className="text-[11px] text-[#6B7799] mb-2">
                Materialised plans ({full.plans.length}):
              </p>
              <ul className="space-y-1">
                {full.plans.map((p) => (
                  <li key={p.id} className="text-[11px] text-[#B8C5E0]">
                    w{p.seriesWeekNumber ?? "?"} · {p.weekOf} · {p.theme ?? "(no theme yet)"}
                    {" "}
                    <span className={`px-1.5 py-0.5 rounded ${STATUS_COLOR[p.status] ?? "bg-slate-500/20 text-slate-300"}`}>
                      {p.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArcEditor({ seriesId, initial, onToast, onCancel, onSaved }: {
  seriesId: string;
  initial: SeriesWeekArc[];
  onToast: (m: string) => void;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [weeks, setWeeks] = useState<SeriesWeekArc[]>(
    initial.map((w) => ({
      ...w,
      plannedLessonFormats: [...(w.plannedLessonFormats ?? [])],
    })),
  );
  const [busy, setBusy] = useState(false);

  function patch(i: number, p: Partial<SeriesWeekArc>) {
    setWeeks((ws) => ws.map((w, j) => (j === i ? { ...w, ...p } : w)));
  }
  function move(i: number, dir: -1 | 1) {
    setWeeks((ws) => {
      const j = i + dir;
      if (j < 0 || j >= ws.length) return ws;
      const a = [...ws];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }
  function removeWeek(i: number) {
    setWeeks((ws) => ws.filter((_, j) => j !== i));
  }
  function addWeek() {
    setWeeks((ws) => [
      ...ws,
      {
        weekIndex: ws.length + 1,
        plannedTheme: "",
        plannedHook: "",
        plannedFocus: "",
        plannedLessonFormats: ["lecture"],
      },
    ]);
  }
  function setFormats(i: number, raw: string) {
    const fmts = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is LessonFormat => (LESSON_FORMATS as string[]).includes(s));
    patch(i, { plannedLessonFormats: fmts });
  }

  async function save() {
    if (weeks.length === 0) { onToast("⚠ A series needs at least one week"); return; }
    if (weeks.length > 16) { onToast("⚠ Max 16 weeks"); return; }
    setBusy(true);
    const token = await fetchToken();
    if (!token) { onToast("⚠ Not signed in"); setBusy(false); return; }
    try {
      await api(token, `/series/${seriesId}/arc`, {
        method: "PATCH",
        body: JSON.stringify({
          topicArc: weeks.map((w, i) => ({ ...w, weekIndex: i + 1 })),
        }),
      });
      onToast(`✓ Arc saved — ${weeks.length} weeks`);
      await onSaved();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-amber-300/80">
        ⚠ Reordering or removing weeks after &quot;Plan all weeks&quot; can desync
        already-materialised plans (they keep their original week number).
      </p>
      {weeks.map((w, i) => (
        <div key={i} className="border border-white/10 rounded-xl p-3 space-y-2 bg-[#151B3D]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#00D4FF] text-[12px] font-semibold">Week {i + 1}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => move(i, -1)} disabled={i === 0}
                className="px-1.5 py-0.5 text-[11px] rounded border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-30">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === weeks.length - 1}
                className="px-1.5 py-0.5 text-[11px] rounded border border-white/10 text-[#B8C5E0] hover:bg-white/5 disabled:opacity-30">↓</button>
              <button onClick={() => removeWeek(i)}
                className="px-1.5 py-0.5 text-[11px] rounded border border-red-400/30 text-red-300 hover:bg-red-400/10">🗑</button>
            </div>
          </div>
          <input
            type="text" value={w.plannedTheme}
            onChange={(e) => patch(i, { plannedTheme: e.target.value })}
            placeholder="Theme (8-12 words)"
            className="w-full bg-[#0F1330] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white outline-none focus:border-[#00D4FF]/40"
          />
          <input
            type="text" value={w.plannedHook}
            onChange={(e) => patch(i, { plannedHook: e.target.value })}
            placeholder="Hook (one-line stakes)"
            className="w-full bg-[#0F1330] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white outline-none focus:border-[#00D4FF]/40"
          />
          <textarea
            value={w.plannedFocus}
            onChange={(e) => patch(i, { plannedFocus: e.target.value })}
            placeholder="Focus — what this week teaches (2-3 sentences)"
            rows={2}
            className="w-full bg-[#0F1330] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white outline-none focus:border-[#00D4FF]/40"
          />
          <input
            type="text" value={(w.plannedLessonFormats ?? []).join(", ")}
            onChange={(e) => setFormats(i, e.target.value)}
            placeholder="formats: lecture, live_coding"
            className="w-full bg-[#0F1330] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-[#B8C5E0] outline-none focus:border-[#00D4FF]/40"
          />
          <p className="text-[9px] text-[#6B7799]">
            valid: {LESSON_FORMATS.join(" · ")}
          </p>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Btn label="➕ Add week" onClick={addWeek} />
        <span className="ml-auto" />
        <Btn label="Cancel" onClick={onCancel} />
        <PrimaryBtn label="💾 Save arc" busy={busy} onClick={save} />
      </div>
    </div>
  );
}
