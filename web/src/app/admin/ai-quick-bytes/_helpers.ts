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

export type ThumbnailStyle =
  | "shocked_reaction" | "bold_text" | "visual_metaphor"
  | "brand_signature";

export interface AqbMemoryRow {
  id: string;
  memoryType: string;     // 'hook' | 'style' | 'thumbnail_style' | 'topic' | 'hashtag' | 'do' | 'dont'
  content: string;
  weight: number;
  appliesTo: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AqbPostmortemRow {
  id: string;
  scriptId: string;
  content: {
    worked?: string[];
    didntWork?: string[];
    next?: string[];
    reusableHookPattern?: string;
    winningThumbnailStyle?: string;
    topicSignal?: string;
  };
  modelUsed: string | null;
  costUsd: number | string | null;
  createdAt: string;
}

export interface ThumbnailVariation {
  style: ThumbnailStyle;
  headline: string;
  teluguHeadline?: string;
  prompt: string;
  reasoning: string;
  estimatedCtrScore: number;
}

export interface ThumbnailPromptResp {
  scriptId: string;
  dayNumber: number | null;
  thumbnailPrompt:
    | { variations: ThumbnailVariation[] }
    | { prompt: string; overlayText: string } // legacy single-prompt rows
    | null;
  generatedAt: string | null;
}

export interface DistributionPackage {
  youtube?: { title: string; description: string; tags: string[] };
  instagram?: { caption: string; hashtags: string[]; full_text: string };
  linkedin?: { body: string; hashtags: string[]; full_text: string };
  whatsapp_channel?: { full_text: string };
  whatsapp_status?: { full_text: string };
  source_reference?: { title: string; url: string; source_name: string };
  generated_at?: string;
}

export interface DistributionResp {
  scriptId: string;
  dayNumber: number | null;
  package: DistributionPackage | null;
  generatedAt: string | null;
}

// ── Telugu track (AQB v2) ───────────────────────────────────────────────
export interface TeluguResp {
  scriptId: string;
  dayNumber: number | null;
  teluguHook: string | null;
  teluguBody: string | null;
  teluguCta: string | null;
  teluguFullScript: string | null;
  teluguTranslationModel: string | null;
  teluguTranslationCostUsd: number;
  teluguTranslatedAt: string | null;
  teluguHeygenVideoId: string | null;
  teluguHeygenVideoUrl: string | null;
  teluguHeygenStatus: string;
  teluguDistributionPackage: DistributionPackage | null;
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
