"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { useDashboardStore } from "@/lib/store/dashboard";
import { INTERVIEW_COLOR, type InterviewType } from "@/types";

// ── Data ──────────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES: {
  type:        InterviewType;
  label:       string;
  description: string;
  icon:        string;
  duration:    string;
  bgClass:     string;
}[] = [
  {
    type:        "behavioral",
    label:       "Behavioral",
    description: "STAR-format · Leadership · Conflict · Motivation",
    icon:        "forum",
    duration:    "20–45 min",
    bgClass:     "bg-violet-50",
  },
  {
    type:        "coding",
    label:       "Coding",
    description: "Algorithms · Data structures · Live coding",
    icon:        "code",
    duration:    "45–60 min",
    bgClass:     "bg-teal-50",
  },
  {
    type:        "system-design",
    label:       "System Design",
    description: "Architecture · Scalability · Trade-offs",
    icon:        "architecture",
    duration:    "45–60 min",
    bgClass:     "bg-amber-50",
  },
  {
    type:        "hr",
    label:       "HR / Culture Fit",
    description: "Values · Career goals · Culture alignment",
    icon:        "handshake",
    duration:    "20–30 min",
    bgClass:     "bg-green-50",
  },
  {
    type:        "case-study",
    label:       "Case Study",
    description: "Business problems · Estimation · Product thinking",
    icon:        "cases",
    duration:    "30–45 min",
    bgClass:     "bg-pink-50",
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function TypeCard({
  type, label, description, icon, duration, bgClass,
}: typeof INTERVIEW_TYPES[number]) {
  const color = INTERVIEW_COLOR[type];
  return (
    <Link
      href={`/interview/setup?type=${type}`}
      className="group flex items-center gap-4 bg-surface border border-border
                 rounded-2xl px-5 py-4 hover:border-blue hover:shadow-md
                 transition-all duration-150 active:scale-[0.99]"
    >
      {/* Color pill icon */}
      <div
        className={clsx("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", bgClass)}
      >
        <span
          className="material-symbols-outlined text-[22px]"
          style={{
            color,
            fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24",
          }}
        >
          {icon}
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-text-pri leading-tight">{label}</p>
        <p className="text-[13px] text-text-muted mt-0.5 truncate">{description}</p>
      </div>

      {/* Duration + chevron */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[12px] font-medium text-text-muted bg-bg-app px-2.5 py-1 rounded-lg">
          {duration}
        </span>
        <span
          className="material-symbols-outlined text-[18px] text-text-muted
                     group-hover:text-blue group-hover:translate-x-0.5 transition-all"
          style={{ fontVariationSettings: "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}
        >
          chevron_right
        </span>
      </div>
    </Link>
  );
}

function SpecialCard({
  title, subtitle, icon, iconBg, iconColor, href, tag,
}: {
  title:       string;
  subtitle:    string;
  icon:        string;
  iconBg:      string;
  iconColor:   string;
  href:        string;
  tag?:        string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 bg-surface border border-border
                 rounded-2xl p-5 hover:border-blue hover:shadow-md
                 transition-all duration-150 active:scale-[0.99]"
    >
      {tag && (
        <span className="absolute top-4 right-4 label text-blue bg-blue/10 px-2 py-0.5 rounded-md">
          {tag}
        </span>
      )}
      <div
        className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}
      >
        <span
          className="material-symbols-outlined text-[20px]"
          style={{
            color: iconColor,
            fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24",
          }}
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="text-[15px] font-semibold text-text-pri">{title}</p>
        <p className="text-[13px] text-text-sec mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1 text-[13px] font-medium text-blue mt-auto pt-1">
        <span>Get started</span>
        <span
          className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform"
          style={{ fontVariationSettings: "'FILL' 0,'wght' 500,'GRAD' 0,'opsz' 20" }}
        >
          arrow_forward
        </span>
      </div>
    </Link>
  );
}

function RecommendationCard({
  topic, description, href, priority,
}: {
  topic:       string;
  description: string;
  href:        string;
  priority:    "high" | "medium" | "low";
}) {
  const priorityStyle =
    priority === "high"   ? "bg-red-50  text-[#EF4444]" :
    priority === "medium" ? "bg-amber-50 text-[#F59E0B]" :
                            "bg-blue-50 text-[#3B82F6]";
  const priorityLabel =
    priority === "high" ? "Focus area" : priority === "medium" ? "Needs work" : "Good progress";

  return (
    <div className="flex items-start gap-4 bg-surface border border-border rounded-2xl p-4">
      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span
          className="material-symbols-outlined text-[17px] text-[#7C3AED]"
          style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20" }}
        >
          auto_awesome
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[14px] font-semibold text-text-pri">{topic}</p>
          <span className={clsx("label px-2 py-0.5 rounded-md", priorityStyle)}>{priorityLabel}</span>
        </div>
        <p className="text-[13px] text-text-sec mt-0.5">{description}</p>
      </div>
      <Link
        href={href}
        className="flex-shrink-0 text-[13px] font-semibold text-blue hover:text-blue/80 transition-colors"
      >
        Practice →
      </Link>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PracticePage() {
  const { weakAreas, upcomingInterview } = useDashboardStore();

  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── Header ── */}
      <div className="space-y-1">
        <h1 className="text-heading-l text-text-pri">Practice</h1>
        <p className="text-body text-text-sec">
          Pick a session type and the AI adapts every question to your role, level, and company.
        </p>
      </div>

      {/* ── Upcoming interview nudge ── */}
      {upcomingInterview && (
        <div className="flex items-center gap-3 bg-blue/5 border border-blue/20 rounded-2xl px-5 py-3.5">
          <span
            className="material-symbols-outlined text-[20px] text-blue flex-shrink-0"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
          >
            event
          </span>
          <p className="text-[14px] text-text-pri flex-1">
            <span className="font-semibold">{upcomingInterview.title}</span>
            {" "} in{" "}
            <span className="font-semibold text-blue">{upcomingInterview.daysRemaining} days</span>
            {" "}— keep your streak going.
          </p>
          <Link
            href="/interview/setup"
            className="flex-shrink-0 text-[13px] font-semibold text-blue hover:text-blue/80 transition-colors"
          >
            Start now →
          </Link>
        </div>
      )}

      {/* ── Interview type cards ── */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          Choose interview type
        </h2>
        <div className="space-y-2.5">
          {INTERVIEW_TYPES.map((t) => (
            <TypeCard key={t.type} {...t} />
          ))}
        </div>
      </section>

      {/* ── Special sessions ── */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          Special sessions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SpecialCard
            href="/interview/setup?mode=full-loop"
            title="Full Loop"
            subtitle="60-min session covering Behavioral, Coding & System Design questions"
            icon="all_inclusive"
            iconBg="bg-blue/10"
            iconColor="#3B82F6"
            tag="Most thorough"
          />
          <SpecialCard
            href="/question-bank"
            title="Custom Session"
            subtitle="Pick questions from the bank and build your own practice set"
            icon="tune"
            iconBg="bg-violet-50"
            iconColor="#7C3AED"
          />
        </div>
      </section>

      {/* ── AI Recommendations (only if weak areas exist) ── */}
      {weakAreas.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[18px] text-[#7C3AED]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20" }}
            >
              auto_awesome
            </span>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">
              AI recommends
            </h2>
          </div>
          <div className="space-y-2.5">
            {weakAreas.slice(0, 3).map((area) => (
              <RecommendationCard
                key={area.id}
                topic={area.topic}
                description={area.description}
                href={area.practiceHref}
                priority={area.priority}
              />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
