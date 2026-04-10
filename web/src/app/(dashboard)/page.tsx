"use client";

import { useDashboardStore } from "@/lib/store/dashboard";
import GreetingSection from "@/components/dashboard/GreetingSection";
import ReadinessScoreCard from "@/components/dashboard/ReadinessScoreCard";
import JumpBackIn from "@/components/dashboard/JumpBackIn";
import RecentSessions from "@/components/dashboard/RecentSessions";
import WeakAreasPanel from "@/components/dashboard/WeakAreasPanel";
import DailyChallenge from "@/components/dashboard/DailyChallenge";

/**
 * Screen 1: Home Dashboard
 * Spec: Left sidebar + main content (greeting, readiness, jump-back-in, recent sessions)
 *       + right column (weak areas, quick resources)
 */
export default function DashboardPage() {
  const user              = useDashboardStore((s) => s.user);
  const readiness         = useDashboardStore((s) => s.readiness);
  const upcomingInterview = useDashboardStore((s) => s.upcomingInterview);
  const recentSessions    = useDashboardStore((s) => s.recentSessions);
  const weakAreas         = useDashboardStore((s) => s.weakAreas);

  return (
    <div className="flex gap-8 items-start">
      {/* ──────────── Center canvas ──────────── */}
      <div className="flex-1 min-w-0 space-y-8">
        {/* 1. Greeting + countdown */}
        <GreetingSection
          firstName={user.firstName}
          upcoming={upcomingInterview}
        />

        {/* 2. AI Readiness Score */}
        <ReadinessScoreCard score={readiness} />

        {/* 3. Daily Challenge */}
        <DailyChallenge />

        {/* 4. Jump Back In */}
        <JumpBackIn />

        {/* 5. Recent Sessions */}
        <RecentSessions sessions={recentSessions} />
      </div>

      {/* ──────────── Right panel (xl+) ──────────── */}
      {/* Spec: "Right column (340px)" */}
      <aside className="hidden xl:flex flex-col w-[300px] flex-shrink-0">
        <WeakAreasPanel areas={weakAreas} />
      </aside>
    </div>
  );
}
