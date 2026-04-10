"use client";

import Link from "next/link";
import type { WeakArea } from "@/types";

const PRIORITY_STYLE: Record<WeakArea["priority"], { color: string; label: string; barColor: string }> = {
  high:   { color: "text-[#EF4444]", label: "High",   barColor: "#EF4444" },
  medium: { color: "text-[#F59E0B]", label: "Medium", barColor: "#F59E0B" },
  low:    { color: "text-text-sec",  label: "Low",    barColor: "#3B82F6" },
};

interface Props {
  areas: WeakArea[];
}

function WeakAreaItem({ area }: { area: WeakArea }) {
  const s = PRIORITY_STYLE[area.priority];

  return (
    <div>
      <p className="text-[13px] font-semibold text-text-pri leading-snug">
        {area.topic}
      </p>
      <p className="text-small text-text-sec mt-0.5 leading-relaxed">
        {area.description}
      </p>

      {/* Priority bar */}
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 h-1.5 bg-bg-app rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${area.progress * 100}%`, backgroundColor: s.barColor }}
          />
        </div>
        <span className={`label ${s.color} flex-shrink-0`} style={{ fontSize: 10 }}>
          {s.label}
        </span>
      </div>

      {/* Spec: "Practice this →" link */}
      <Link
        href={area.practiceHref}
        className="inline-flex items-center gap-0.5 mt-1.5 text-small text-blue font-semibold hover:underline"
      >
        Practice this
        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </Link>
    </div>
  );
}

export default function WeakAreasPanel({ areas }: Props) {
  return (
    <div className="space-y-5">
      {/* ── Start Interview CTA ── */}
      <Link
        href="/interview/setup"
        className="w-full btn-gradient text-white py-3.5 rounded-xl font-bold text-[15px]
                   flex items-center justify-center gap-2 shadow-blue-glow
                   hover:shadow-float hover:-translate-y-0.5 transition-all active:scale-95"
      >
        <span
          className="material-symbols-outlined text-[20px]"
          style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
        >
          play_circle
        </span>
        Start New Interview
      </Link>

      {/* ── Weak Areas card ── */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span
            className="material-symbols-outlined text-[#EF4444] text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
          >
            trending_down
          </span>
          <h3 className="label text-text-pri">Weak Areas</h3>
        </div>

        {areas.length === 0 ? (
          <div className="text-center py-4 space-y-2">
            <span className="material-symbols-outlined text-[32px] text-text-muted"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>
              auto_awesome
            </span>
            <p className="text-[12px] text-text-sec leading-relaxed">
              Complete a few sessions and the AI will identify your weak spots here.
            </p>
          </div>
        ) : (
          <div className="space-y-5 divide-y divide-border">
            {areas.map((area, i) => (
              <div key={area.id} className={i > 0 ? "pt-5" : ""}>
                <WeakAreaItem area={area} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick Resources ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: "book",          label: "Prep Guide",  color: "text-blue",   href: "/resources/guide" },
          { icon: "video_library", label: "Masterclass", color: "text-violet", href: "/resources/masterclass" },
        ].map((r) => (
          <Link
            key={r.label}
            href={r.href}
            className="bg-surface border border-border rounded-xl p-4 text-center
                       hover:shadow-card transition-shadow flex flex-col items-center gap-1"
          >
            <span className={`material-symbols-outlined text-[24px] ${r.color}`}>{r.icon}</span>
            <p className="label text-text-pri" style={{ fontSize: 11 }}>{r.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
