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
  /** Phase C: per-brand model overrides ({ task → modelId }). */
  modelOverrides: Record<string, string>;
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

/** Quality metadata (Phase B Grader + Improvement Loop) on every asset. */
export interface AssetQuality {
  qualityScore: number | null;
  revisions: number;
  critique: string | null;
  confidence: number | null;
}

export interface ScriptAsset extends AssetQuality {
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

export interface QuizPoolItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number | null;
  difficulty: string | null;
  validationPassed: boolean | null;
  validatedBy: string | null;
  status: string;
  explanation: string | null;
}

export interface DeliveredQuizSummary {
  delivered: { id: string; weekOf: string; createdAt: string } | null;
  questions: QuizPoolItem[];
}

export interface QuizPoolListResponse {
  data: QuizPoolItem[];
  count: number;
  valid: number;
  passRate: number;
}

export type PipelineStage =
  | "script" | "ppt" | "seo" | "thumbnail" | "promo" | "quiz" | "draw";
export type PipelineStatus =
  | "queued" | "running" | "completed" | "failed" | "cancelled";

export interface PipelineRun {
  id: string;
  planId: string;
  status: PipelineStatus;
  currentStage: PipelineStage | null;
  stagesCompleted: PipelineStage[];
  stagesFailed: Array<{ stage: PipelineStage; error: string; at: string }>;
  resumableFrom: PipelineStage | null;
  costAtStart: number;
  costDelta: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "script", "ppt", "seo", "thumbnail", "promo", "quiz", "draw",
];

// ── Phase C / Slice C2: audit + asset versions ───────────────────────────

export interface AuditEntry {
  id: string;
  entityType: "brand" | "asset" | "plan" | "memory";
  entityId: string | null;
  userId: string | null;
  userEmail: string | null;
  action: "created" | "updated" | "deleted" | "rolled_back";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  summary: string | null;
  createdAt: string;
}

export interface AssetVersionMeta {
  id: string;
  version: number;
  qualityScore: number | null;
  revisions: number;
  critique: string | null;
  confidence: number | null;
  status: string;
  createdAt: string;
}

export type RollbackableAssetType =
  | "script" | "ppt" | "seo" | "thumbnail_prompt" | "promo";

export type DlqStatus = "pending" | "retried" | "abandoned";

export interface DlqJob {
  id: string;
  jobType: string;
  payload: { planId?: string; runId?: string; stage?: PipelineStage } & Record<string, unknown>;
  error: string | null;
  attempts: number;
  status: DlqStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SeoAsset extends AssetQuality {
  id: string;
  lessonId: string | null;
  planId: string | null;
  assetType: string;
  version: number;
  content: {
    titleVariants?: string[];
    chosenTitleIndex?: number;
    chosenTitle?: string;
    description?: string;
    tags?: string[];
    endScreenCards?: Array<{ label?: string; why?: string }>;
    model?: string;
    provider?: string;
    costUsd?: number;
  } | null;
  status: string;
  createdAt: string;
}

export interface ThumbnailAsset extends AssetQuality {
  id: string;
  lessonId: string | null;
  planId: string | null;
  assetType: string;
  version: number;
  content: {
    mainPrompt?: string;
    facePosition?: string;
    textOverlay?: string;
    colorPalette?: string[];
    mood?: string;
    style?: string;
    alternates?: string[];
    model?: string;
    provider?: string;
    costUsd?: number;
  } | null;
  status: string;
  createdAt: string;
}

export interface PromoAsset extends AssetQuality {
  id: string;
  lessonId: string | null;
  planId: string | null;
  assetType: string;
  version: number;
  content: {
    linkedin?: { hook?: string; body?: string; cta?: string; hashtags?: string[] };
    instagram?: { caption?: string; hashtags?: string[] };
    whatsappStatus?: { text?: string; chars?: number; lines?: number };
    model?: string;
    provider?: string;
    costUsd?: number;
  } | null;
  status: string;
  createdAt: string;
}

export interface PptAsset extends AssetQuality {
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
