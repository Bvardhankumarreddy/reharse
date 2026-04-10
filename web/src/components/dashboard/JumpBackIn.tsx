"use client";

import Link from "next/link";
import type { QuickStartCard } from "@/types";

// Spec: "4 quick-start cards: Behavioral, Coding, System Design, Full Loop"
const CARDS: (QuickStartCard & {
  href: string;
  bgIcon: string;
  chipColor: string;
  chipBg: string;
  hoverBorder: string;
  gradient?: boolean;
})[] = [
  {
    type: "behavioral",
    label: "Behavioral",
    duration: "30 min",
    description: "STAR method",
    icon: "forum",
    href: "/interview/setup?type=behavioral",
    bgIcon: "bg-violet-50",
    chipColor: "text-[#7C3AED]",
    chipBg: "bg-violet-50",
    hoverBorder: "hover:border-[#7C3AED]",
  },
  {
    type: "coding",
    label: "Coding",
    duration: "45 min",
    description: "DSA",
    icon: "code",
    href: "/interview/setup?type=coding",
    bgIcon: "bg-teal-50",
    chipColor: "text-[#0EA5E9]",
    chipBg: "bg-teal-50",
    hoverBorder: "hover:border-[#0EA5E9]",
  },
  {
    type: "system-design",
    label: "System Design",
    duration: "60 min",
    description: "Architecture",
    icon: "architecture",
    href: "/interview/setup?type=system-design",
    bgIcon: "bg-amber-50",
    chipColor: "text-[#F59E0B]",
    chipBg: "bg-amber-50",
    hoverBorder: "hover:border-[#F59E0B]",
  },
  {
    type: "hr", // hr is the closest general-purpose type for a full loop
    label: "Full Loop",
    duration: "90 min",
    description: "All types",
    icon: "autorenew",
    href: "/interview/setup",
    bgIcon: "bg-white/20",
    chipColor: "text-white",
    chipBg: "bg-white/20",
    hoverBorder: "",
    gradient: true,
  },
];

export default function JumpBackIn() {
  return (
    // Spec: section title "Jump Back In"
    <section>
      <h3 className="text-heading-m text-text-pri mb-4">Jump Back In</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CARDS.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={[
              "group p-4 sm:p-5 rounded-2xl text-left transition-all duration-200",
              "hover:shadow-md hover:-translate-y-0.5 active:scale-95",
              card.gradient
                ? "btn-gradient"
                // Spec: "white, rounded 12px, hover: blue border" → we use type-specific border on hover
                : `bg-surface border border-border ${card.hoverBorder}`,
            ].join(" ")}
          >
            {/* Icon pill */}
            <div
              className={`w-10 h-10 rounded-xl ${card.bgIcon} flex items-center justify-center mb-3`}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${
                  card.gradient ? "text-white" : card.chipColor
                }`}
              >
                {card.icon}
              </span>
            </div>

            {/* Title + duration */}
            <h4
              className={`text-[14px] font-bold ${
                card.gradient ? "text-white" : "text-text-pri"
              }`}
            >
              {card.label}
            </h4>
            <p
              className={`text-[12px] mt-1 ${
                card.gradient ? "text-white/70" : "text-text-sec"
              }`}
            >
              {card.duration} · {card.description}
            </p>

            {/* Spec: "violet 'AI Adaptive' chip" on each card */}
            <span
              className={`inline-flex items-center gap-1 mt-3 px-2 py-0.5
                          rounded-full label ${card.chipBg} ${card.chipColor}`}
              style={{ fontSize: 10 }}
            >
              <span
                className="material-symbols-outlined text-[11px]"
                style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
              >
                auto_awesome
              </span>
              AI Adaptive
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
