"use client";

import type { ReadinessScore } from "@/types";

interface Props {
  score: ReadinessScore;
}

// Spec: donut ring chart with 4 breakdown bars
// Circumference of r=70 circle: 2π×70 ≈ 439.8
const CIRCUMFERENCE = 439.8;

const DIMENSIONS = [
  { key: "coding"        as const, label: "Coding",        color: "#0EA5E9" },
  { key: "systemDesign"  as const, label: "System Design", color: "#F59E0B" },
  { key: "behavioral"    as const, label: "Behavioral",    color: "#7C3AED" },
  { key: "communication" as const, label: "Communication", color: "#3B82F6" },
];

function DonutRing({ value }: { value: number }) {
  const filled = CIRCUMFERENCE * (value / 100);
  const offset = CIRCUMFERENCE - filled;

  return (
    <div className="relative w-44 h-44">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 176 176">
        {/* Track */}
        <circle
          cx="88" cy="88" r="70"
          fill="none" stroke="#E2E6ED" strokeWidth="10"
        />
        {/* Fill */}
        <circle
          cx="88" cy="88" r="70"
          fill="none" stroke="#3B82F6" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="ring-fill"
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[40px] font-black text-text-pri tracking-tighter leading-none">
          {value}
        </span>
        <span className="label text-text-sec mt-1" style={{ fontSize: 10 }}>
          Readiness Score
        </span>
      </div>
    </div>
  );
}

function BreakdownBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="label text-text-sec">{label}</span>
        <span
          className="font-mono text-[13px] font-bold"
          style={{ color }}
        >
          {value}%
        </span>
      </div>
      <div className="h-2 bg-bg-app rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const DIMENSION_LABELS: Record<string, string> = {
  coding: "Coding", systemDesign: "System Design",
  behavioral: "Behavioral", communication: "Communication",
};

function deriveInsight(score: ReadinessScore): { label: string; sub: string; insight: string } {
  const dims = Object.entries({
    coding: score.coding, systemDesign: score.systemDesign,
    behavioral: score.behavioral, communication: score.communication,
  }).sort((a, b) => a[1] - b[1]);

  const weakest  = dims[0];
  const strongest = dims[dims.length - 1];
  const label = score.overall >= 85 ? "Interview Ready"
    : score.overall >= 70 ? "Strong Foundation"
    : score.overall >= 50 ? "Making Progress"
    : "Getting Started";

  if (score.overall >= 85) {
    return {
      label,
      sub: `${DIMENSION_LABELS[strongest[0]]} is your top strength. Keep the momentum.`,
      insight: `You're above the 85% benchmark. Focus on consistency across all areas to stay sharp.`,
    };
  }

  const gap      = 85 - weakest[1];
  const sessions = Math.max(2, Math.ceil(gap / 8));
  return {
    label,
    sub: `Focus on ${DIMENSION_LABELS[weakest[0]]} to reach the 85% benchmark.`,
    insight: `${DIMENSION_LABELS[weakest[0]]} is your weakest area at ${weakest[1]}%. `
           + `${sessions} focused sessions recommended to close the gap.`,
  };
}

const QUICK_STARTS = [
  { label: "Behavioral",    href: "/interview/setup?type=behavioral",    icon: "forum",        color: "#7C3AED", bg: "bg-violet-50" },
  { label: "Coding",        href: "/interview/setup?type=coding",        icon: "code",         color: "#0EA5E9", bg: "bg-sky-50"    },
  { label: "System Design", href: "/interview/setup?type=system-design", icon: "architecture", color: "#F59E0B", bg: "bg-amber-50"  },
];

function NewUserCard() {
  return (
    <section className="bg-surface rounded-card p-6 lg:p-8 shadow-card border border-border">
      <div className="flex flex-col md:flex-row items-center gap-8">
        {/* Illustration */}
        <div className="flex-shrink-0 w-40 h-40 rounded-full bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-[64px] text-[#7C3AED]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>
            rocket_launch
          </span>
        </div>

        <div className="flex-1 space-y-4 text-center md:text-left">
          <div>
            <p className="text-[20px] font-black text-text-pri">Your readiness score starts here</p>
            <p className="text-text-sec text-[14px] mt-1 leading-relaxed">
              Complete your first mock interview and the AI will calculate your readiness across Behavioral, Coding, System Design, and Communication.
            </p>
          </div>

          {/* Quick-start buttons */}
          <div className="flex flex-wrap gap-2 justify-center md:justify-start">
            {QUICK_STARTS.map((q) => (
              <a key={q.label} href={q.href}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-bg-app hover:border-blue/40 hover:shadow-sm transition-all text-[13px] font-semibold text-text-pri">
                <span className={`w-6 h-6 rounded-lg ${q.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className="material-symbols-outlined text-[14px]"
                    style={{ color: q.color, fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
                    {q.icon}
                  </span>
                </span>
                {q.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[12px] text-text-muted justify-center md:justify-start">
            <span className="material-symbols-outlined text-[14px]">info</span>
            Takes 20–45 min · AI feedback ready in under a minute
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ReadinessScoreCard({ score }: Props) {
  // Show onboarding card if no sessions have been completed yet
  if (score.overall === 0 && score.coding === 0 && score.behavioral === 0) {
    return <NewUserCard />;
  }

  const { label, sub, insight } = deriveInsight(score);
  return (
    <section className="bg-surface rounded-card p-6 lg:p-8 shadow-card border border-border">
      <div className="flex flex-col lg:flex-row gap-8">

        {/* ── Donut chart + label ── */}
        <div className="flex flex-col items-center justify-center gap-3 flex-shrink-0 lg:w-52">
          <DonutRing value={score.overall} />
          <div className="text-center">
            <p className="text-[15px] font-semibold text-text-pri">{label}</p>
            <p className="text-small text-text-sec mt-0.5 max-w-[180px] leading-relaxed text-center">{sub}</p>
          </div>
        </div>

        {/* ── Breakdown bars + AI insight ── */}
        <div className="flex-1 flex flex-col justify-center gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {DIMENSIONS.map((d) => (
              <BreakdownBar
                key={d.key}
                label={d.label}
                value={score[d.key]}
                color={d.color}
              />
            ))}
          </div>

          <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3.5">
            <span
              className="material-symbols-outlined text-[#7C3AED] text-[20px] mt-0.5 flex-shrink-0"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
            >
              auto_awesome
            </span>
            <p className="text-small text-text-pri leading-relaxed">
              <span className="font-semibold text-[#7C3AED]">AI Insight: </span>
              {insight}
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
