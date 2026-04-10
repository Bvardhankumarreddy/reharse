"use client";

import Link from "next/link";
import { clsx } from "clsx";
import type { RecentSession } from "@/types";
import { getScoreBand, SCORE_BAND_BG, INTERVIEW_BG } from "@/types";

const TYPE_ICON: Record<string, string> = {
  coding:          "psychology",
  behavioral:      "chat",
  "system-design": "account_tree",
  hr:              "handshake",
  "case-study":    "lightbulb",
};

interface Props {
  sessions: RecentSession[];
}

function SessionRow({ session }: { session: RecentSession }) {
  const band = getScoreBand(session.score);
  const scoreCls = SCORE_BAND_BG[band];
  const typeCls  = INTERVIEW_BG[session.type] ?? "bg-gray-50 text-gray-600";

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="bg-surface border border-border rounded-xl px-4 py-3.5
                 flex items-center gap-3 hover:shadow-card transition-shadow"
    >
      {/* Type icon */}
      <div className={clsx("w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0", typeCls.split(" ")[0])}>
        <span className={clsx("material-symbols-outlined text-[18px] sm:text-[20px]", typeCls.split(" ")[1])}>
          {TYPE_ICON[session.type] ?? "quiz"}
        </span>
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] sm:text-[14px] font-semibold text-text-pri truncate">
          {session.title}
        </p>
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 mt-0.5">
          <span className="text-small text-text-muted">
            {session.date} · {session.duration}
          </span>
          <span className={clsx("px-2 py-0.5 rounded-full label hidden sm:inline", typeCls)} style={{ fontSize: 10 }}>
            {session.type === "system-design" ? "System Design" : session.type.charAt(0).toUpperCase() + session.type.slice(1)}
          </span>
        </div>
      </div>

      {/* Right: score + chevron */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={clsx("font-mono text-[12px] sm:text-[13px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full", scoreCls)}>
          {session.score}
        </span>
        <span className="material-symbols-outlined text-text-muted text-[18px]">
          chevron_right
        </span>
      </div>
    </Link>
  );
}

export default function RecentSessions({ sessions }: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-heading-m text-text-pri">Recent Sessions</h3>
        {sessions.length > 0 && (
          <Link href="/sessions" className="text-small text-blue font-semibold hover:underline">
            View All History
          </Link>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="bg-surface border border-border rounded-card p-8 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-50 flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px] text-[#7C3AED]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
              forum
            </span>
          </div>
          <div>
            <p className="text-[15px] font-bold text-text-pri">No sessions yet</p>
            <p className="text-text-sec text-[13px] mt-1 leading-relaxed">
              Complete your first mock interview to start tracking your progress and get AI feedback.
            </p>
          </div>
          <Link
            href="/interview/setup"
            className="inline-flex items-center gap-2 btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow hover:-translate-y-0.5 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
              play_circle
            </span>
            Start your first interview
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </section>
  );
}
