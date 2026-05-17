// Shared helpers for the AI Quick Bytes admin pages.
"use client";

export type NewsItemStatus =
  | "raw" | "scored" | "scripted" | "approved"
  | "generating" | "ready" | "published" | "rejected" | "failed";

export type ScriptStatus =
  | "draft" | "approved" | "rejected"
  | "generating" | "ready" | "published" | "failed";

export interface NewsSourceRow {
  id: string;
  name: string;
  sourceType: string;
  isActive: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  errorCount: number;
}

export interface NewsScore {
  importanceScore: number;
  noveltyScore: number;
  viralPotential: number;
  compositeScore: number;
  reasoning: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  status: NewsItemStatus;
  source?: { name: string } | null;
  score?: NewsScore | null;
}

export interface ShortScript {
  id: string;
  newsItemId: string;
  hook: string;
  body: string;
  cta: string;
  fullScript: string;
  durationEstimateSeconds: number | null;
  avatarId: string | null;
  brandVoiceScore: number | null;
  status: ScriptStatus;
  rejectionReason: string | null;
  heygenVideoUrl: string | null;
  youtubeUrl: string | null;
  createdAt: string;
  newsItem?: { title: string; url: string; source?: { name: string } | null } | null;
}

export interface DailyStats {
  publishedToday: number;
  llmCostToday: number;
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
  return fetch(`/api/v1/admin/ai-quick-bytes${path}`, {
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

export const STATUS_COLOR: Record<string, string> = {
  raw:        "bg-slate-500/20 text-slate-300",
  scored:     "bg-cyan-500/20 text-cyan-300",
  scripted:   "bg-violet-500/20 text-violet-300",
  draft:      "bg-amber-500/20 text-amber-300",
  approved:   "bg-blue-500/20 text-blue-300",
  generating: "bg-violet-500/20 text-violet-300 animate-pulse",
  ready:      "bg-emerald-500/20 text-emerald-300",
  published:  "bg-emerald-500/20 text-emerald-300",
  rejected:   "bg-slate-500/20 text-slate-400",
  failed:     "bg-red-500/20 text-red-300",
};
