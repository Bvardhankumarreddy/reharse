"use client";

import { useState, useEffect } from "react";
import type { UpcomingInterview } from "@/types";

interface Props {
  firstName: string;
  upcoming: UpcomingInterview | null;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Countdown ring — proportion of days remaining out of total */
function CountdownRing({
  days,
  total,
}: {
  days: number;
  total: number;
}) {
  // SVG circle: r=22, circumference = 2πr ≈ 138.2
  const C = 138.2;
  const remaining = C * (days / total);
  const offset = C - remaining;

  return (
    <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
      <svg className="absolute inset-0 -rotate-90 w-14 h-14" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3.5" />
        <circle
          cx="28" cy="28" r="22" fill="none"
          stroke="rgba(255,255,255,0.9)" strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="text-[22px] font-black leading-none text-white">{days}</span>
    </div>
  );
}

export default function GreetingSection({ firstName, upcoming }: Props) {
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => { setGreeting(getGreeting()); }, []);

  return (
    // Spec: "Top row: 'Good morning, Priya' in 28px bold, grey subtext"
    <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      {/* Left — greeting */}
      <div>
        <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight text-text-pri leading-tight">
          {greeting}, {firstName}
        </h2>
        {upcoming ? (
          <p className="text-body text-text-sec mt-1 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-text-muted">
              calendar_today
            </span>
            Your {upcoming.company} {upcoming.role} interview is in {upcoming.daysRemaining} days
          </p>
        ) : (
          <p className="text-body text-text-sec mt-1">
            Ready to practice? Let&apos;s get started.
          </p>
        )}
      </div>

      {/* Right — countdown card */}
      {/* Spec: "countdown card — '6 days' in large blue number" */}
      {upcoming && (
        <div
          className="flex-shrink-0 bg-blue text-white rounded-2xl px-6 py-4
                     flex items-center gap-4 shadow-blue-glow"
        >
          <CountdownRing days={upcoming.daysRemaining} total={upcoming.totalDays} />
          <div>
            <p className="label text-white/70" style={{ fontSize: 10 }}>
              Upcoming Milestone
            </p>
            <p className="text-[15px] font-bold leading-snug mt-0.5">
              {upcoming.title}
            </p>
            <p className="text-small text-white/80 mt-0.5">
              {upcoming.daysRemaining} days remaining
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
