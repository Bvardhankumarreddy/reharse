// Shared helpers for the AI Squad admin pages.
"use client";

export type CharacterKey = "byte" | "kira_serious" | "kira_fun" | "atlas" | "luna";

export interface Theme {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  targetAudience: string;
  estimatedTopicsCount: number;
  status: "active" | "archived";
  createdAt: string;
}

export interface Topic {
  id: string;
  themeId: string;
  title: string;
  description: string | null;
  angle: string | null;
  topicType: string | null;
  recommendedCharacters: CharacterKey[];
  difficulty: string;
  estimatedDurationMinutes: number;
  format: "long" | "short";
  keyConcepts: string[];
  status: string;
  createdAt: string;
  theme?: { title: string } | null;
}

export interface DialogueSegment {
  id: string;
  segmentOrder: number;
  characterKey: CharacterKey;
  speakerName: string;
  text: string;
  textWithPauses: string | null;
  emotionTag: string | null;
  durationEstimateSeconds: number | null;
  heygenStatus: string;
}

export interface ThumbnailVariation {
  index: number;
  style: string;
  headline: string;
  prompt: string;
  reasoning: string;
  estimatedCtrScore: number;
}

export interface LanguageVersion {
  id: string;
  episodeId: string;
  languageCode: string;
  isPrimary: boolean;
  translatedFullText: string | null;
  translationCostUsd: number;
  status: string;
  publishedYoutubeUrl: string | null;
}

export interface Episode {
  id: string;
  topicId: string;
  episodeNumber: number;
  languages?: string[];
  title: string | null;
  status: string;
  charactersUsed: CharacterKey[];
  characterCount: number;
  format: "long" | "short";
  fullDialogueText: string | null;
  durationEstimateSeconds: number | null;
  totalSegments: number;
  llmCostUsd: number;
  thumbnailPrompts: ThumbnailVariation[] | null;
  distributionPackage: Record<string, unknown> | null;
  publishedYoutubeUrl: string | null;
  createdAt: string;
  topic?: { title: string } | null;
  segments?: DialogueSegment[];
}

export async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token?: string };
    return token ?? null;
  } catch {
    return null;
  }
}

export function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  return fetch(`/api/v1/admin/ai-squad${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message ?? `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  });
}

export const CHAR_COLOR: Record<CharacterKey, string> = {
  byte:         "bg-cyan-500/20 text-cyan-300",
  kira_serious: "bg-amber-500/20 text-amber-300",
  kira_fun:     "bg-amber-500/20 text-amber-200",
  atlas:        "bg-red-500/20 text-red-300",
  luna:         "bg-violet-500/20 text-violet-300",
};

export const STATUS_COLOR: Record<string, string> = {
  active:             "bg-emerald-500/20 text-emerald-300",
  archived:           "bg-slate-500/20 text-slate-400",
  planned:            "bg-slate-500/20 text-slate-300",
  dialogue_generated: "bg-cyan-500/20 text-cyan-300",
  in_production:      "bg-violet-500/20 text-violet-300",
  planning:           "bg-slate-500/20 text-slate-300",
  generating_videos:  "bg-violet-500/20 text-violet-300 animate-pulse",
  ready:              "bg-emerald-500/20 text-emerald-300",
  approved:           "bg-blue-500/20 text-blue-300",
  published:          "bg-emerald-500/20 text-emerald-300",
  rejected:           "bg-slate-500/20 text-slate-400",
  failed:             "bg-red-500/20 text-red-300",
  completed:          "bg-emerald-500/20 text-emerald-300",
};
