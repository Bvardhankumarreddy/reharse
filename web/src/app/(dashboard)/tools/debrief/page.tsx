"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";

const INTERVIEW_TYPES = [
  { value: "behavioral",    label: "Behavioral" },
  { value: "coding",        label: "Coding" },
  { value: "system-design", label: "System Design" },
  { value: "hr",            label: "HR / Culture" },
  { value: "case-study",    label: "Case Study" },
];

const OUTCOMES = [
  { value: "pending",  label: "Awaiting response", icon: "schedule",      color: "text-amber-500 bg-amber-50" },
  { value: "next",     label: "Moved to next round", icon: "trending_up",  color: "text-blue bg-blue/10" },
  { value: "offer",    label: "Received offer",     icon: "celebration",   color: "text-green-600 bg-green-50" },
  { value: "rejected", label: "Not selected",       icon: "sentiment_dissatisfied", color: "text-red-500 bg-red-50" },
];

interface Debrief {
  id:      string;
  date:    string;
  company: string;
  role:    string;
  type:    string;
  outcome: string;
  notes:   string;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOMES.find((o) => o.value === outcome) ?? OUTCOMES[0];
  return (
    <span className={clsx("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold", o.color)}>
      <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>{o.icon}</span>
      {o.label}
    </span>
  );
}

const PRACTICE_CTA: Record<string, { label: string; href: string; tip: string }> = {
  rejected: {
    label: "Practice this interview type again",
    tip:   "Rejection is data. Drilling the same format builds muscle memory.",
    href:  "/practice",
  },
  next: {
    label: "Prepare for the next round",
    tip:   "You made it through — keep momentum going with a focused practice session.",
    href:  "/practice",
  },
};

function DebriefCard({ debrief, onDelete }: { debrief: Debrief; onDelete: () => void }) {
  const typeLabel = INTERVIEW_TYPES.find((t) => t.value === debrief.type)?.label ?? debrief.type;
  const cta = PRACTICE_CTA[debrief.outcome];
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-text-pri">{debrief.company} — {debrief.role}</p>
          <p className="text-[12px] text-text-muted">{typeLabel} · {new Date(debrief.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <OutcomeBadge outcome={debrief.outcome} />
          <button onClick={onDelete} title="Delete" className="p-1 text-text-muted hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
      {debrief.notes && (
        <p className="text-[13px] text-text-sec leading-relaxed border-t border-border pt-2">{debrief.notes}</p>
      )}
      {cta && (
        <div className="flex items-center gap-3 pt-1 border-t border-border">
          <span className="material-symbols-outlined text-[16px] text-blue flex-shrink-0"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>fitness_center</span>
          <p className="text-[12px] text-text-sec flex-1">{cta.tip}</p>
          <Link
            href={`${cta.href}?type=${debrief.type}`}
            className="flex-shrink-0 text-[12px] font-semibold text-white bg-blue hover:bg-blue/90 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            Practice now →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function DebriefPage() {
  const { api, ready } = useApiClient();

  const [debriefs,    setDebriefs]    = useState<Debrief[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [lastLogged,  setLastLogged]  = useState<Debrief | null>(null);

  // Form state
  const [company, setCompany] = useState("");
  const [role,    setRole]    = useState("");
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [type,    setType]    = useState("behavioral");
  const [outcome, setOutcome] = useState("pending");
  const [notes,   setNotes]   = useState("");

  // Load debriefs from user preferences
  useEffect(() => {
    if (!ready) return;
    api.getMe()
      .then((u) => {
        const stored = (u.preferences as Record<string, unknown> | null)?.debriefs;
        if (Array.isArray(stored)) setDebriefs(stored as Debrief[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api, ready]);

  async function save(updated: Debrief[]) {
    setSaving(true);
    try {
      await api.updateMe({ preferences: { debriefs: updated } as never });
      setDebriefs(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleAdd() {
    if (!company.trim() || !role.trim()) return;
    const entry: Debrief = {
      id:      crypto.randomUUID(),
      date,
      company: company.trim(),
      role:    role.trim(),
      type,
      outcome,
      notes:   notes.trim(),
    };
    const updated = [entry, ...debriefs];
    save(updated);
    setLastLogged(entry);
    setCompany(""); setRole(""); setNotes(""); setDate(new Date().toISOString().slice(0, 10));
    setType("behavioral"); setOutcome("pending");
  }

  function handleDelete(id: string) {
    save(debriefs.filter((d) => d.id !== id));
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-heading-l text-text-pri">Real Interview Log</h2>
        <p className="text-body text-text-sec mt-1">
          Track your real interviews, outcomes, and lessons learned — all in one place.
        </p>
      </div>

      {/* Add form */}
      <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <h3 className="text-[14px] font-bold text-text-pri">Log an Interview</h3>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Company *</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google"
              className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri
                         placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Role *</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Engineer L5"
              className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri
                         placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri
                         focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Interview Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri
                         focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
            >
              {INTERVIEW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Outcome chips */}
        <div>
          <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Outcome</label>
          <div className="flex flex-wrap gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                onClick={() => setOutcome(o.value)}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all",
                  outcome === o.value ? o.color + " border-transparent" : "border-border text-text-sec hover:border-blue/40",
                )}
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>{o.icon}</span>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Notes / Lessons Learned</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What went well? What would you do differently? Any surprises?"
            rows={3}
            className="w-full px-3 py-2.5 bg-bg-app border border-border rounded-xl text-[13px] text-text-pri
                       placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAdd}
            disabled={saving || !company.trim() || !role.trim()}
            className="btn-gradient text-white px-5 py-2.5 rounded-btn font-semibold text-[13px]
                       flex items-center gap-2 shadow-blue-glow disabled:opacity-50"
          >
            {saving
              ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</>
              : <><span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>add</span>Log Interview</>
            }
          </button>
          {saveMsg && <p className="text-[12px] text-text-muted">{saveMsg}</p>}
        </div>

        {/* Practice CTA — shown immediately after logging a rejection or next-round */}
        {lastLogged && PRACTICE_CTA[lastLogged.outcome] && (
          <div className="flex items-start gap-3 bg-blue/5 border border-blue/20 rounded-xl p-4">
            <span className="material-symbols-outlined text-[22px] text-blue flex-shrink-0 mt-0.5"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>fitness_center</span>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-text-pri">Ready to improve?</p>
              <p className="text-[12px] text-text-sec mt-0.5">
                {PRACTICE_CTA[lastLogged.outcome].tip}
              </p>
            </div>
            <Link
              href={`${PRACTICE_CTA[lastLogged.outcome].href}?type=${lastLogged.type}`}
              className="flex-shrink-0 btn-gradient text-white px-4 py-2 rounded-btn text-[12px] font-semibold shadow-blue-glow whitespace-nowrap"
            >
              Practice {INTERVIEW_TYPES.find((t) => t.value === lastLogged.type)?.label ?? lastLogged.type} →
            </Link>
          </div>
        )}
      </div>

      {/* Log list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-text-pri">Interview History</h3>
          <span className="text-[12px] text-text-muted">{debriefs.length} logged</span>
        </div>

        {loading && (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="bg-surface border border-border rounded-xl h-20 animate-pulse" />)}
          </div>
        )}

        {!loading && debriefs.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <span className="material-symbols-outlined text-[40px] text-text-muted">work_history</span>
            <p className="text-[14px] font-semibold text-text-pri">No interviews logged yet</p>
            <p className="text-text-sec text-[13px]">Use the form above to log your real interviews.</p>
          </div>
        )}

        {debriefs.map((d) => (
          <DebriefCard key={d.id} debrief={d} onDelete={() => handleDelete(d.id)} />
        ))}
      </div>
    </div>
  );
}
