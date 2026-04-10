import { create } from "zustand";
import type {
  ReadinessScore,
  RecentSession,
  WeakArea,
  UpcomingInterview,
  InterviewType,
} from "@/types";
import type { ApiClient, UserResponse, SessionResponse, FeedbackResponse } from "@/lib/api/client";

// ── State shape ───────────────────────────────────────────────────────────────

interface DashboardState {
  hydrated: boolean;
  loading:  boolean;

  user:              { name: string; firstName: string; streak: number };
  readiness:         ReadinessScore;
  upcomingInterview: UpcomingInterview | null;
  recentSessions:    RecentSession[];
  weakAreas:         WeakArea[];

  // Actions
  hydrate: (api: ApiClient) => Promise<void>;
  setLoading: (v: boolean) => void;
}

// ── Seed (shown before first API response) ────────────────────────────────────

const SEED_READINESS: ReadinessScore = {
  overall:       72,
  coding:        68,
  systemDesign:  55,
  behavioral:    81,
  communication: 84,
};

const SEED_WEAK_AREAS: WeakArea[] = [
  {
    id:          "w1",
    topic:       "Behavioral interview answers",
    description: "Practice structuring responses using the STAR method.",
    priority:    "high",
    progress:    0.3,
    practiceHref: "/interview/setup?type=behavioral",
  },
  {
    id:          "w2",
    topic:       "System design fundamentals",
    description: "Review scalability, databases, and distributed systems concepts.",
    priority:    "medium",
    progress:    0.2,
    practiceHref: "/interview/setup?type=system-design",
  },
  {
    id:          "w3",
    topic:       "Coding problem-solving",
    description: "Build fluency with common data structures and algorithm patterns.",
    priority:    "medium",
    progress:    0.2,
    practiceHref: "/interview/setup?type=coding",
  },
  {
    id:          "w4",
    topic:       "Communication under pressure",
    description: "Practice thinking aloud and articulating your reasoning clearly.",
    priority:    "low",
    progress:    0.1,
    practiceHref: "/interview/setup",
  },
];

// ── Readiness / weak areas from real feedback ─────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function computeReadiness(
  sessions: SessionResponse[],
  feedback: FeedbackResponse[],
): ReadinessScore {
  const completed = sessions.filter((s) => s.status === "completed" && s.overallScore != null);
  if (!completed.length) return SEED_READINESS;

  const byType = (type: string) =>
    completed
      .filter((s) => s.interviewType === type && s.overallScore != null)
      .map((s) => s.overallScore as number);

  const fbBySession = new Map(feedback.map((f) => [f.sessionId, f]));
  const commScores  = completed
    .map((s) => fbBySession.get(s.id)?.dimensionScores?.["communication"])
    .filter((v): v is number => typeof v === "number");

  return {
    overall:       avg(completed.map((s) => s.overallScore as number)),
    coding:        avg(byType("coding"))         || SEED_READINESS.coding,
    systemDesign:  avg(byType("system-design"))  || SEED_READINESS.systemDesign,
    behavioral:    avg(byType("behavioral"))     || SEED_READINESS.behavioral,
    communication: avg(commScores)               || SEED_READINESS.communication,
  };
}

function computeWeakAreas(feedback: FeedbackResponse[]): WeakArea[] {
  const counts = new Map<string, number>();
  for (const f of feedback) {
    for (const topic of f.weakAreas ?? []) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  if (!counts.size) return SEED_WEAK_AREAS;

  const PRIORITY_MAP: Record<number, WeakArea["priority"]> = { 0: "high", 1: "high", 2: "medium", 3: "medium" };
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([topic], i) => ({
      id:          `wa-${i}`,
      topic,
      description: "Identified from your recent sessions",
      priority:    PRIORITY_MAP[i] ?? "low",
      progress:    Math.max(0.1, 1 - (counts.get(topic) ?? 1) / feedback.length),
      practiceHref: "/practice",
    }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function userDisplayName(u: UserResponse): { name: string; firstName: string } {
  const firstName = u.firstName ?? u.email.split("@")[0];
  const name      = [u.firstName, u.lastName].filter(Boolean).join(" ") || firstName;
  return { name, firstName };
}

function computeUpcomingInterview(u: UserResponse): import("@/types").UpcomingInterview | null {
  if (!u.interviewDate) return null;
  const target = new Date(u.interviewDate);
  const now    = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const daysRemaining = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  if (daysRemaining < 0) return null; // date passed
  return {
    title:         `${u.targetRole ?? "Interview"} at ${u.targetCompany ?? "your target company"}`,
    company:       u.targetCompany ?? "your target company",
    role:          u.targetRole    ?? "Interview",
    daysRemaining,
    totalDays:     Math.max(daysRemaining, 30),
  };
}

function sessionToRecent(s: SessionResponse): RecentSession {
  const type = s.interviewType as InterviewType;
  const labels: Record<InterviewType, string> = {
    behavioral:      "Behavioral Interview",
    coding:          "Coding Interview",
    "system-design": "System Design Session",
    hr:              "HR / Culture Fit",
    "case-study":    "Case Study Session",
  };
  const ago = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };
  return {
    id:         s.id,
    title:      `${labels[type]}${s.targetRole ? ` — ${s.targetRole}` : ""}`,
    type,
    date:       ago(s.createdAt),
    duration:   `${s.durationMinutes} min`,
    targetRole: s.targetRole ?? s.targetCompany ?? "General",
    score:      s.overallScore ?? 0,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDashboardStore = create<DashboardState>((set, get) => ({
  hydrated: false,
  loading:  false,

  user:              { name: "You", firstName: "there", streak: 0 },
  readiness:         SEED_READINESS,
  upcomingInterview: null,
  recentSessions:    [],
  weakAreas:         SEED_WEAK_AREAS,

  setLoading: (v) => set({ loading: v }),

  hydrate: async (api: ApiClient) => {
    if (get().hydrated) return;          // only run once per session
    set({ loading: true });

    try {
      const [me, sessionsResult, feedbackResult] = await Promise.allSettled([
        api.getMe(),
        api.getSessions(),
        api.getUserFeedback(),
      ]);

      // ── User profile ───────────────────────────────────────────────────────
      if (me.status === "fulfilled") {
        const u = me.value;
        set({
          user:              { ...userDisplayName(u), streak: u.currentStreak },
          upcomingInterview: computeUpcomingInterview(u),
        });
      }

      const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : [];
      const feedback = feedbackResult.status  === "fulfilled" ? feedbackResult.value  : [];

      // ── Recent sessions ────────────────────────────────────────────────────
      const recent = sessions
        .filter((s) => s.status === "completed")
        .slice(0, 5)
        .map((s) => sessionToRecent(s));

      // ── Readiness & weak areas from real data ──────────────────────────────
      const readiness  = computeReadiness(sessions, feedback);
      const weakAreas  = computeWeakAreas(feedback);

      set({ recentSessions: recent, readiness, weakAreas, hydrated: true });
    } catch {
      // Silently fall back to seed data — API may not be running locally
      set({ hydrated: true });
    } finally {
      set({ loading: false });
    }
  },
}));
