"use client";

// Content Studio — admin. API at /api/v1/admin/content-studio (AdminGuard).
// Slice 1: brands + Strategy Agent (week plan → theme + 2 lessons) + cost log.

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  fetchToken, api, STATUS_COLOR,
  type Brand, type BrandMemory, type WeeklyPlan,
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
              plans.map((p) => <PlanCard key={p.id} plan={p} brands={brands} />)
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

function PlanCard({ plan, brands }: { plan: WeeklyPlan; brands: Brand[] }) {
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
          {full.quizScope && (
            <Block title="📝 Quiz scope">
              <p className="text-[12px] text-[#B8C5E0]">{full.quizScope}</p>
            </Block>
          )}
          {(full.lessons ?? []).map((l) => (
            <Block key={l.id} title={`🎓 Lesson ${l.lessonNumber}: ${l.title}`}>
              {l.hook && (
                <p className="text-[12px] text-[#B8C5E0] mb-2">
                  <span className="text-[#6B7799]">Hook: </span>{l.hook}
                </p>
              )}
              <p className="text-[10px] text-[#6B7799] mb-1">
                ~{l.targetDurationMinutes} min · {l.outline?.length ?? 0} sections
              </p>
              <ul className="space-y-1.5">
                {(l.outline ?? []).map((s, i) => (
                  <li key={i} className="text-[12px] text-[#B8C5E0]">
                    <span className="font-semibold">{s.heading}</span>
                    <ul className="list-disc list-inside text-[#6B7799] mt-0.5">
                      {(s.points ?? []).map((pt, j) => <li key={j}>{pt}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </Block>
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
