// Shared helpers for the Content Studio admin page.
"use client";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  voiceStyle: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  isActive: boolean;
}

export interface BrandMemory {
  id: string;
  memoryType: string;
  content: string;
  weight: number;
  isActive: boolean;
}

export interface OutlineSection {
  heading: string;
  points: string[];
}

export interface Lesson {
  id: string;
  lessonNumber: number;
  title: string;
  hook: string | null;
  outline: OutlineSection[];
  targetDurationMinutes: number;
  status: string;
}

export interface AgentRun {
  id: string;
  agentType: string;
  provider: string | null;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface ScriptAsset {
  id: string;
  lessonId: string | null;
  planId: string | null;
  assetType: string;
  version: number;
  content: {
    fullScript?: string;
    wordCount?: number;
    durationEstimateSeconds?: number;
    model?: string;
    provider?: string;
    costUsd?: number;
  } | null;
  status: string;
  createdAt: string;
}

export interface SlideJson {
  layout: "title" | "kicker" | "bullets" | "end";
  title?: string;
  subtitle?: string;
  kicker?: string;
  body?: string;
  bullets?: string[];
}

export interface PptAsset {
  id: string;
  lessonId: string | null;
  planId: string | null;
  assetType: string;
  version: number;
  content: {
    slides?: SlideJson[];
    slideCount?: number;
    model?: string;
    provider?: string;
    costUsd?: number;
  } | null;
  status: string;
  createdAt: string;
}

export interface WeeklyPlan {
  id: string;
  brandId: string;
  weekOf: string;
  theme: string | null;
  quizScope: string | null;
  status: string;
  totalCostUsd: number;
  lessonCount?: number;
  lessons?: Lesson[];
  agentRuns?: AgentRun[];
  createdAt: string;
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
  return fetch(`/api/v1/admin/content-studio${path}`, {
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
  planned:    "bg-slate-500/20 text-slate-300",
  generating: "bg-violet-500/20 text-violet-300 animate-pulse",
  ready:      "bg-emerald-500/20 text-emerald-300",
  failed:     "bg-red-500/20 text-red-300",
  success:    "bg-emerald-500/20 text-emerald-300",
};
