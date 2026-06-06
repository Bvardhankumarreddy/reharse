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

export type LessonFormat =
  | "lecture" | "live_coding" | "walkthrough" | "interview" | "short";

export const LESSON_FORMATS: LessonFormat[] = [
  "lecture", "live_coding", "walkthrough", "interview", "short",
];

export interface Lesson {
  id: string;
  lessonNumber: number;
  title: string;
  hook: string | null;
  outline: OutlineSection[];
  targetDurationMinutes: number;
  lessonFormat: LessonFormat;
  explanationMode?: "inline" | "with_screen_recording";
  status: string;
}

// ── Quiz winners (mega-update) ─────────────────────────────────────────
export interface QuizWinner {
  rank: number;
  name: string;
  score: number;
  maxScore: number;
  timeSeconds: number;
  prizeInr: number;
}
export interface WinnerPosts {
  youtube_community?: string;
  instagram?: { caption: string; hashtags: string[]; full_text: string };
  linkedin?:  { body: string;    hashtags: string[]; full_text: string };
  whatsapp_channel?: string;
  whatsapp_status?:  string;
}
export interface WinnerThumbnailVariation {
  style: "podium" | "speed_highlight" | "hall_of_fame";
  headline: string;
  prompt: string;
  reasoning: string;
  estimatedCtrScore: number;
}
export interface QuizWinnerResp {
  id: string;
  planId: string;
  brandId: string;
  quizNumber: number;
  quizTopic: string | null;
  totalParticipants: number | null;
  speedHighlight: string | null;
  winners: QuizWinner[];
  posts: WinnerPosts | null;
  thumbnailPrompts: WinnerThumbnailVariation[] | null;
  postsModel: string | null;
  thumbnailsModel: string | null;
  postsCostUsd: string;
  thumbnailsCostUsd: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ── Phase E: multi-week Series ──────────────────────────────────────────

export type SeriesStatus = "planning" | "active" | "completed" | "paused";

export interface SeriesWeekArc {
  weekIndex: number;
  plannedTheme: string;
  plannedHook: string;
  plannedFocus: string;
  plannedLessonFormats: LessonFormat[];
}

export interface ContentSeries {
  id: string;
  brandId: string;
  name: string;
  description: string | null;
  goal: string | null;
  targetWeeks: number;
  topicArc: SeriesWeekArc[];
  currentWeek: number;
  status: SeriesStatus;
  startWeekOf: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesDetail extends ContentSeries {
  plans: WeeklyPlan[];
}

export interface SeriesPlanAllResponse {
  seriesId: string;
  plansCreated: Array<{
    planId: string;
    weekOf: string;
    theme: string | null;
    weekIndex: number;
  }>;
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
    // Telugu translation (CsTranslationService)
    teluguFullScript?: string;
    teluguWordCount?: number;
    teluguTranslationModel?: string;
    teluguTranslationCostUsd?: number;
    teluguTranslatedAt?: string;
  } | null;
  status: string;
  createdAt: string;
}

export interface AudioAsset {
  id: string;
  lessonId: string | null;
  planId: string | null;
  assetType: string;
  version: number;
  storageKey: string | null;
  content: {
    provider?: string;
    model?: string;
    voice?: string | null;
    chars?: number;
    bytes?: number;
    chunks?: number;
    durationEstimateSeconds?: number;
    costUsd?: number;
  } | null;
  status: string;
  /** Presigned playback URL (15-min TTL) — present on the GET .../audio response. */
  url?: string;
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

// ── Admin-Quiz-Module CSV bundle ───────────────────────────────────────────
export type BundleQuestionType =
  | "mcq" | "true_false" | "multi_select" | "numeric";

export interface QuizBundleQuestionItem {
  position: number;
  questionType: BundleQuestionType;
  questionText: string;
  optionA: string | null; optionB: string | null;
  optionC: string | null; optionD: string | null;
  correctAnswer: string | null;
  correctAnswers: string | null;
  correctNumber: number | null;
  numericTolerance: number | null;
  numericUnit: string | null;
  points: number;
  difficulty: "easy" | "medium" | "hard";
  category: string | null;
  lessonNumber: number | null;
  isMandatory: boolean;
}

export interface QuizBundleResp {
  id: string;
  planId: string;
  brandId: string;
  weekOf: string;
  title: string;
  description: string;
  tieBreaker: {
    question: string;
    answer: number;
    tolerance: number;
    unit: string | null;
  };
  questionCount: number;
  toughness: number;
  quizWeek: number | null;
  generatorModel: string | null;
  costUsd: number;
  createdAt: string;
  questions: QuizBundleQuestionItem[];
}

export interface QuizBundleEnvelope {
  bundle: null;
}

// ── Quiz promo posts (LLM-generated schedule + reward + per-platform copy) ─
export interface QuizPromoLessonLink {
  lessonNumber: number;
  title: string;
  youtubeUrl: string | null;
}
export interface QuizPromoPayload {
  youtube_community?: {
    title: string; description: string; hashtags: string[]; full_text: string;
  };
  linkedin?: {
    hook: string; body: string; cta: string; hashtags: string[]; full_text: string;
  };
  instagram?: {
    caption: string; hashtags: string[]; full_text: string;
  };
  whatsapp_channel?: { full_text: string };
  whatsapp_status?:  { full_text: string };
  last_chance?:      { full_text: string };
  lesson_links?: QuizPromoLessonLink[];
  social_footer?: { lines: string[]; block: string };
  generated_at?: string;
}
export interface QuizPromoResp {
  id: string;
  bundleId: string;
  planId: string;
  brandId: string;
  startsAtLabel: string;
  endsAtLabel: string;
  rewardLabel: string;
  payload: QuizPromoPayload;
  generatorModel: string | null;
  costUsd: number;
  createdAt: string;
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

// ── Phase C / Slice C3: stats dashboard ──────────────────────────────────

export interface CostPerWeek { weekStart: string; costUsd: number }
export interface QualityPoint {
  assetType: string; weekStart: string; avgScore: number; samples: number;
}
export interface SuccessRow {
  agentType: string; success: number; failed: number; total: number; rate: number;
}
export interface TopFailure {
  error: string; count: number; lastAt: string; agentType: string;
}
export interface MemoryPoolRow {
  agentType: string; applicable: number; total: number;
}
export interface StatsBundle {
  costPerWeek: CostPerWeek[];
  qualityTrend: QualityPoint[];
  successRate: SuccessRow[];
  topFailures: TopFailure[];
  memoryPool: MemoryPoolRow[];
  generatedAt: string;
}

// ── Phase D: intelligence (competitors / metrics / postmortems / publish / comments)

export interface CompetitorChannel {
  id: string;
  brandId: string;
  name: string;
  channelHandle: string | null;
  youtubeChannelId: string | null;
  isActive: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastError: string | null;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelVideoRow {
  id: string;
  externalId: string;
  title: string;
  publishedAt: string | null;
  viewCount: number | string;       // bigint → string from API
  likeCount: number | string | null;
  commentCount: number | string | null;
  durationSeconds: number | null;
}

export interface ChannelVideosResp {
  top: ChannelVideoRow[];
  recent: ChannelVideoRow[];
  count: number;
}

export interface CompetitorVideo {
  id: string;
  competitorChannelId: string;
  externalId: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  durationSeconds: number | null;
  fetchedAt: string;
}

export interface LessonMetricsRow {
  id: string;
  lessonId: string;
  youtubeVideoId: string;
  views: number;
  likes: number | null;
  comments: number | null;
  ctr: number | null;
  avgViewDurationSec: number | null;
  retentionPct: number | null;
  subscribersGained: number | null;
  fetchedAt: string;
}

export interface LessonPostmortemRow {
  id: string;
  lessonId: string;
  content: {
    worked?: string[];
    didntWork?: string[];
    next?: string[];
    reusableHookPattern?: string;
  };
  modelUsed: string | null;
  costUsd: number;
  createdAt: string;
}

export interface PublishedVideoRow {
  id: string;
  lessonId: string;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  publishedAt: string | null;
  thumbnailB64: string | null;
  thumbnailPrompt: string | null;
  thumbnailModel: string | null;
  status: "pending" | "uploaded" | "live" | "failed";
  error: string | null;
}

export interface CommentDraft {
  comment: {
    id: string;
    authorDisplayName: string;
    textOriginal: string;
    publishedAt: string;
    likeCount: number;
  };
  spam: { isSpam: boolean; confidence: number; reason: string };
  suggestedReply: string | null;
}

export interface CommentDraftsResponse {
  drafts: CommentDraft[];
  canPostReplies: boolean;
}

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
    style?: string;            // chosen preset: cinematic | clean | dramatic
    aspectRatio?: string;      // 16:9 | 1:1 | 9:16
    dalleSize?: string;        // the DALL-E render size for that aspect
    artDirectionNotes?: string;
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
    linkedin?: { hook?: string; body?: string; cta?: string; hashtags?: string[]; full_text?: string };
    instagram?: { caption?: string; hashtags?: string[]; full_text?: string };
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
  /** Phase E: stash of the Strategy Agent's "why this theme" rationale. */
  notes: string | null;
  status: string;
  totalCostUsd: number;
  /** Phase E: when set, this week belongs to a multi-week series. */
  seriesId: string | null;
  seriesWeekNumber: number | null;
  /** Curator gate — pipeline can't run until 'approved'. */
  approvalStatus: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
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
