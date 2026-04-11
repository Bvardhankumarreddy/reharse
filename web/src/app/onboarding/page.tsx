"use client";

// Spec § 7. Onboarding Flow — 4 screens
// "Superhuman meets Linear — premium, focused, fast."

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";

// ── Step data ─────────────────────────────────────────────────────────────────

const GOALS = [
  { id: "job_search",    label: "Job Interview",       icon: "work",        desc: "Prepare for upcoming tech interviews" },
  { id: "promotion",     label: "Promotion / Internal", icon: "trending_up", desc: "Prep for internal panel or level-up review" },
  { id: "career_change", label: "Career Change",        icon: "swap_horiz",  desc: "Switching roles or industries" },
  { id: "explore",       label: "Just Exploring",       icon: "explore",     desc: "See what AI interview prep feels like" },
] as const;

const LEVELS = [
  { id: "Entry-level (0–1 years)", label: "Student / New Grad", sub: "0 – 1 year experience" },
  { id: "Entry-level (0–2 years)", label: "Early Career",       sub: "0 – 3 years" },
  { id: "Mid-level (3–5 years)",   label: "Mid-level",          sub: "3 – 7 years" },
  { id: "Senior (5–8 years)",      label: "Senior+",            sub: "7+ years" },
] as const;

const COMPANIES = [
  "Google", "Amazon", "Meta", "Apple", "Microsoft",
  "Stripe", "Airbnb", "Netflix", "Uber", "LinkedIn",
  "Twitter/X", "Salesforce", "Adobe", "Atlassian", "Shopify",
];

const ROLES = [
  "Software Engineer", "Senior Software Engineer", "Staff Engineer",
  "Product Manager", "Senior Product Manager",
  "Data Scientist", "Data Analyst", "ML Engineer",
  "Engineering Manager", "Director of Engineering",
  "Designer / UX", "DevOps / SRE", "QA Engineer",
  "Business Analyst", "Consultant",
];

const COMPANY_TYPES = [
  { id: "product",    label: "Product Company",   desc: "Google, Meta, Stripe…"     },
  { id: "service",    label: "Service / IT",       desc: "TCS, Infosys, Accenture…"  },
  { id: "startup",    label: "Startup",            desc: "Series A–C, early stage"   },
  { id: "fintech",    label: "Fintech",            desc: "Banks, payments, trading"  },
  { id: "consulting", label: "Consulting / MBB",   desc: "McKinsey, BCG, Deloitte…"  },
  { id: "any",        label: "Not sure yet",       desc: "General preparation"       },
];

// ── Animation variants ────────────────────────────────────────────────────────

const slideVariants = {
  enter:  { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0  },
  exit:   { opacity: 0, x: -40 },
};

// ── Step components ───────────────────────────────────────────────────────────

function Step1Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl btn-gradient flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>mic</span>
        </div>
        <span className="text-[20px] font-bold tracking-tight text-text-pri">Rehearse</span>
      </div>

      <div className="space-y-3">
        <h1 className="text-[36px] font-bold tracking-tight text-text-pri leading-tight">
          Ace your next interview
        </h1>
        <p className="text-[18px] text-text-sec leading-relaxed max-w-[380px]">
          Practice with an AI that adapts, listens, and tells you exactly what to fix
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-5">
        {[
          { icon: "⚡", text: "Ready in 10 seconds" },
          { icon: "🎯", text: "Honest AI feedback"  },
          { icon: "📈", text: "Track your progress" },
        ].map((p) => (
          <div key={p.text} className="flex items-center gap-1.5 text-small text-text-sec">
            <span>{p.icon}</span>
            <span className="font-medium">{p.text}</span>
          </div>
        ))}
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={onNext}
          className="w-full h-14 btn-gradient text-white rounded-btn font-bold text-[16px]
                     shadow-blue-glow hover:-translate-y-0.5 transition-all active:scale-95"
        >
          Start Practicing Free
        </button>
        <p className="text-small text-text-muted text-center">
          No credit card required · Takes 30 seconds to set up
        </p>
      </div>

      <div className="w-full pt-4 border-t border-border">
        <p className="text-small text-text-muted mb-3">Trusted by engineers at</p>
        <div className="flex justify-center flex-wrap gap-4">
          {["Google", "Meta", "Amazon", "Microsoft", "Stripe"].map((c) => (
            <span key={c} className="text-[13px] font-bold text-text-sec">{c}</span>
          ))}
        </div>
      </div>

      <p className="text-small text-text-sec">
        Already have an account?{" "}
        <a href="/sign-in" className="text-blue font-semibold hover:underline">Sign in →</a>
      </p>
    </div>
  );
}

function Step2Goal({
  onNext,
}: {
  onNext: (goal: string, company: string, role: string, companyType: string) => void;
}) {
  const [selected,     setSelected]     = useState<string | null>(null);
  const [companyType,  setCompanyType]  = useState<string | null>(null);
  const [company,      setCompany]      = useState("__select__");
  const [customCompany, setCustomCompany] = useState("");
  const [role,         setRole]         = useState("__select__");
  const [customRole,   setCustomRole]   = useState("");

  const effectiveCompany = company === "__other__" ? customCompany : company === "__select__" ? "" : company;
  const effectiveRole    = role    === "__other__" ? customRole    : role    === "__select__" ? "Software Engineer" : role;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[28px] font-bold text-text-pri">What are you preparing for?</h2>
        <p className="text-body text-text-sec mt-1">Help us personalise your experience</p>
      </div>

      {/* Goal type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelected(g.id)}
            className={clsx(
              "p-5 rounded-2xl border-2 text-left transition-all hover:-translate-y-0.5",
              selected === g.id ? "border-blue bg-blue-50/50" : "border-border bg-surface hover:border-blue/30"
            )}
          >
            <span
              className={clsx("material-symbols-outlined text-[24px] mb-2 block", selected === g.id ? "text-blue" : "text-text-sec")}
              style={{ fontVariationSettings: selected === g.id ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}
            >
              {g.icon}
            </span>
            <p className="text-[14px] font-bold text-text-pri">{g.label}</p>
            <p className="text-small text-text-sec mt-0.5">{g.desc}</p>
          </button>
        ))}
      </div>

      {/* Company type */}
      <div className="space-y-2">
        <label className="label text-text-sec">Type of company</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COMPANY_TYPES.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setCompanyType(ct.id)}
              className={clsx(
                "p-3 rounded-xl border-2 text-left transition-all",
                companyType === ct.id ? "border-blue bg-blue-50/50" : "border-border hover:border-blue/30"
              )}
            >
              <p className={clsx("text-[13px] font-semibold", companyType === ct.id ? "text-blue" : "text-text-pri")}>{ct.label}</p>
              <p className="text-[11px] text-text-muted mt-0.5 leading-tight">{ct.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Role + Company */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="label text-text-sec">Target Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full h-11 px-4 bg-bg-app border border-border rounded-btn text-body text-text-pri focus:outline-none focus:ring-2 focus:ring-blue/20 transition"
          >
            <option value="__select__">Select a role…</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="__other__">Other (type below)</option>
          </select>
          {role === "__other__" && (
            <input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="e.g. Blockchain Developer"
              className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri
                         placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 transition mt-1"
            />
          )}
        </div>
        <div className="space-y-1.5">
          <label className="label text-text-sec">Target Company (optional)</label>
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full h-11 px-4 bg-bg-app border border-border rounded-btn text-body text-text-pri focus:outline-none focus:ring-2 focus:ring-blue/20 transition"
          >
            <option value="__select__">Any company</option>
            {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__other__">Other (type below)</option>
          </select>
          {company === "__other__" && (
            <input
              value={customCompany}
              onChange={(e) => setCustomCompany(e.target.value)}
              placeholder="e.g. Flipkart, Zepto…"
              className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri
                         placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 transition mt-1"
            />
          )}
        </div>
      </div>

      <button
        onClick={() => onNext(selected ?? "explore", effectiveCompany, effectiveRole, companyType ?? "any")}
        disabled={!selected || (role === "__other__" && !customRole.trim()) || (company === "__other__" && !customCompany.trim())}
        className="w-full h-12 btn-gradient text-white rounded-btn font-bold text-[15px]
                   shadow-blue-glow disabled:opacity-40 transition-all hover:-translate-y-0.5"
      >
        Continue →
      </button>
    </div>
  );
}

function Step3Level({ onNext }: { onNext: (level: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[28px] font-bold text-text-pri">What&apos;s your experience level?</h2>
        <p className="text-body text-text-sec mt-1">AI calibrates question difficulty to your level</p>
      </div>

      <div className="space-y-2">
        {LEVELS.map((l) => (
          <button
            key={l.label}
            onClick={() => setSelected(l.id)}
            className={clsx(
              "w-full flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all",
              selected === l.id ? "border-blue bg-blue-50/50" : "border-border bg-surface hover:border-blue/30"
            )}
          >
            <div>
              <p className="text-[14px] font-bold text-text-pri">{l.label}</p>
              <p className="text-small text-text-sec">{l.sub}</p>
            </div>
            <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
              selected === l.id ? "border-blue bg-blue" : "border-border")}>
              {selected === l.id && (
                <span className="material-symbols-outlined text-white text-[12px]"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext(selected ?? "Mid-level (3–5 years)")}
        disabled={!selected}
        className="w-full h-12 btn-gradient text-white rounded-btn font-bold text-[15px]
                   shadow-blue-glow disabled:opacity-40 transition-all hover:-translate-y-0.5"
      >
        Continue →
      </button>
    </div>
  );
}

function Step4FirstInterview({ onStart, loading, error }: { onStart: () => void; loading: boolean; error: string | null }) {
  return (
    <div className="space-y-6 text-center">
      <div className="w-16 h-16 rounded-2xl btn-gradient flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined text-white text-[28px]"
          style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>play_circle</span>
      </div>

      <div>
        <h2 className="text-[28px] font-bold text-text-pri">Try your first 5-minute interview</h2>
        <p className="text-body text-text-sec mt-2 max-w-[360px] mx-auto leading-relaxed">
          We&apos;ve pre-configured a short Behavioral interview at your level. No setup needed.
        </p>
      </div>

      <div className="bg-bg-app border border-border rounded-2xl p-5 text-left space-y-3">
        {[
          { label: "Type",       value: "Behavioral Interview",    icon: "forum",        color: "text-[#7C3AED]" },
          { label: "Duration",   value: "5 minutes (2 questions)", icon: "timer",        color: "text-[#3B82F6]" },
          { label: "Difficulty", value: "Medium",                  icon: "bar_chart",    color: "text-[#F59E0B]" },
          { label: "AI Mode",    value: "Adaptive follow-ups",     icon: "auto_awesome", color: "text-[#7C3AED]" },
        ].map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className={clsx("material-symbols-outlined text-[18px]", r.color)}
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>{r.icon}</span>
            <span className="text-small text-text-sec w-20">{r.label}</span>
            <span className="text-[14px] font-semibold text-text-pri">{r.value}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        disabled={loading}
        className="w-full h-14 btn-gradient text-white rounded-btn font-bold text-[16px]
                   shadow-blue-glow hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-60"
      >
        {loading ? "Setting up…" : "Start Sample Interview →"}
      </button>
      {error && <p className="text-[13px] text-red-500">{error}</p>}
      <p className="text-small text-text-muted">You can always change settings later</p>

      {/* Pro upsell */}
      <div className="border border-blue/20 rounded-2xl p-4 bg-blue/5 text-left">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[16px] text-blue"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>workspace_premium</span>
          <span className="text-[13px] font-bold text-text-pri">Unlock more with Rehearse Pro</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: "all_inclusive", text: "Full 60-min loop sessions" },
            { icon: "psychology",    text: "Coding + System Design" },
            { icon: "bar_chart",     text: "Detailed progress analytics" },
            { icon: "groups",        text: "Peer practice rooms" },
          ].map((f) => (
            <div key={f.text} className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-blue flex-shrink-0"
                style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>{f.icon}</span>
              <span className="text-[12px] text-text-sec">{f.text}</span>
            </div>
          ))}
        </div>
        <a
          href="/settings?tab=billing"
          className="inline-block mt-3 text-[12px] font-semibold text-blue hover:underline"
        >
          View Pro plans →
        </a>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { api, ready } = useApiClient();

  // If user has already completed onboarding (cookie cleared but DB says done),
  // restore the cookie and send them to the dashboard.
  useEffect(() => {
    if (!ready) return;
    api.getMe().then((u) => {
      if (u.onboardingCompleted) {
        document.cookie = "rehearse_onboarded=1; path=/; max-age=31536000; SameSite=Lax";
        router.replace("/");
      }
    }).catch(() => {});
  }, [api, ready, router]);

  const [step,      setStep]      = useState(0);
  const [direction, setDir]       = useState(1);
  const [goalType,     setGoalType]     = useState("explore");
  const [companyType,  setCompanyType]  = useState("any");
  const [targetCompany, setTargetCompany] = useState("");
  const [targetRole,    setTargetRole]    = useState("Software Engineer");
  const [experienceLevel, setExperienceLevel] = useState("Mid-level (3–5 years)");
  const [startLoading, setStartLoading] = useState(false);
  const [startError,   setStartError]   = useState<string | null>(null);

  function advance() { setDir(1); setStep((s) => s + 1); }

  async function handleStart() {
    setStartLoading(true);
    setStartError(null);
    try {
      await api.updateMe({
        goalType,
        companyType,
        targetRole,
        targetCompany: targetCompany || undefined,
        experienceLevel,
        onboardingCompleted: true,
      });

      document.cookie = "rehearse_onboarded=1; path=/; max-age=31536000; SameSite=Lax";

      // Sample interview — no targetCompany so free-tier users aren't gated
      const session = await api.createSession({
        interviewType:   "behavioral",
        targetRole,
        experienceLevel,
        mode:            "text",
        durationMinutes: 5,
      });

      router.push(`/interview/session?sessionId=${session.id}&type=behavioral&mode=text&role=${encodeURIComponent(targetRole)}`);
    } catch (e) {
      setStartLoading(false);
      setStartError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }

  const STEPS = [
    <Step1Welcome key={0} onNext={advance} />,
    <Step2Goal
      key={1}
      onNext={(goal, company, role, ct) => {
        setGoalType(goal);
        setTargetCompany(company);
        setTargetRole(role);
        setCompanyType(ct);
        advance();
      }}
    />,
    <Step3Level
      key={2}
      onNext={async (level) => {
        setExperienceLevel(level);
        // Mark onboarding complete here so returning users always land on dashboard
        // regardless of whether they start the sample interview on Step 4
        try {
          await api.updateMe({ onboardingCompleted: true });
          document.cookie = "rehearse_onboarded=1; path=/; max-age=31536000; SameSite=Lax";
        } catch { /* non-blocking */ }
        advance();
      }}
    />,
    <Step4FirstInterview key={3} onStart={handleStart} loading={startLoading} error={startError} />,
  ];

  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[580px]">

        {/* Progress dots */}
        {step > 0 && step < STEPS.length && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className={clsx(
                "rounded-full transition-all duration-300",
                step === i ? "w-6 h-2 bg-blue" : step > i ? "w-2 h-2 bg-blue/40" : "w-2 h-2 bg-border"
              )} />
            ))}
          </div>
        )}

        {/* Card */}
        <div className="bg-surface rounded-card p-8 shadow-card border border-border overflow-hidden relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              {STEPS[step]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Back */}
        {step > 0 && (
          <button
            onClick={() => { setDir(-1); setStep((s) => s - 1); }}
            className="flex items-center gap-1 mx-auto mt-4 text-small text-text-muted hover:text-text-pri transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
