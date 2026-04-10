// ─── Interview types ──────────────────────────────────────────────────────────
export type InterviewType =
  | "behavioral"
  | "coding"
  | "system-design"
  | "hr"
  | "case-study";

export type Difficulty = "easy" | "medium" | "hard";

// Spec: Score bands (§ 2 Design System)
export type ScoreBand = "strong" | "good" | "fair" | "weak";

export function getScoreBand(score: number): ScoreBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "weak";
}

export const SCORE_BAND_COLOR: Record<ScoreBand, string> = {
  strong: "#22C55E",
  good:   "#3B82F6",
  fair:   "#F59E0B",
  weak:   "#EF4444",
};

export const SCORE_BAND_BG: Record<ScoreBand, string> = {
  strong: "bg-green-50 text-[#22C55E]",
  good:   "bg-blue-50 text-[#3B82F6]",
  fair:   "bg-amber-50 text-[#F59E0B]",
  weak:   "bg-red-50 text-[#EF4444]",
};

// Interview type accent colors (spec § 2)
export const INTERVIEW_COLOR: Record<InterviewType, string> = {
  behavioral:    "#7C3AED",
  coding:        "#0EA5E9",
  "system-design": "#F59E0B",
  hr:            "#22C55E",
  "case-study":  "#EC4899",
};

export const INTERVIEW_BG: Record<InterviewType, string> = {
  behavioral:    "bg-violet-50 text-[#7C3AED]",
  coding:        "bg-teal-50 text-[#0EA5E9]",
  "system-design": "bg-amber-50 text-[#F59E0B]",
  hr:            "bg-green-50 text-[#22C55E]",
  "case-study":  "bg-pink-50 text-[#EC4899]",
};

// ─── Domain models ─────────────────────────────────────────────────────────────
export interface ReadinessScore {
  overall: number;          // 0–100
  coding: number;
  systemDesign: number;
  behavioral: number;
  communication: number;
}

export interface RecentSession {
  id: string;
  title: string;
  type: InterviewType;
  date: string;             // e.g. "Yesterday", "Oct 24"
  duration: string;         // e.g. "45 min"
  targetRole: string;
  score: number;
}

export interface WeakArea {
  id: string;
  topic: string;
  description: string;
  priority: "high" | "medium" | "low";
  progress: number;         // 0–1  (for progress bar width)
  practiceHref: string;
}

export interface QuickStartCard {
  type: InterviewType;
  label: string;
  duration: string;
  description: string;
  icon: string;             // Material Symbol name
}

export interface UpcomingInterview {
  title: string;
  company: string;
  role: string;
  daysRemaining: number;
  totalDays: number;
}
