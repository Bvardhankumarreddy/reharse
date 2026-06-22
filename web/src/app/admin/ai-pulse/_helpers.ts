export type AiPulseVertical =
  | 'ai_business' | 'tech_industry' | 'ai_science' | 'ai_education' | 'ai_society';

export const VERTICAL_LABELS: Record<AiPulseVertical, string> = {
  ai_business:   'AI Business',
  tech_industry: 'Tech Industry',
  ai_science:    'AI Science',
  ai_education:  'AI Education',
  ai_society:    'AI Society',
};

export const VERTICAL_DOW: Record<AiPulseVertical, string> = {
  ai_business:   'Mon',
  tech_industry: 'Tue + Thu',
  ai_science:    'Wed',
  ai_education:  'Fri',
  ai_society:    'Sat',
};

export interface VerticalRow {
  vertical: AiPulseVertical;
  display_name: string;
  description: string;
  day_of_week: number[];
  publish_time: string;
  india_mix_percent: number;
  top_n_per_run: number;
  enabled: boolean;
}

export interface NewsItem {
  id: string;
  vertical: AiPulseVertical;
  source_name: string;
  source_url: string;
  headline: string;
  summary: string | null;
  published_at: string | null;
  status: 'pending' | 'scored' | 'selected' | 'rejected' | 'processed';
  relevance_score: number | null;
  freshness_score: number | null;
  india_relevance_score: number | null;
  total_score: number | null;
  ingested_at: string;
}

export interface ThumbnailPrompt {
  style: string;
  headline: string;
  prompt: string;
  source_badge: string;
}

export interface DistributionPackage {
  youtube?: { title: string; description: string; tags: string[]; pinned_comment: string };
  instagram?: { caption: string; hashtags: string[]; full_text: string; pinned_comment: string };
  linkedin?: { body: string; hashtags: string[]; full_text: string };
  whatsapp_channel?: { full_text: string };
  whatsapp_status?: { full_text: string };
  source_reference: { name: string; url: string };
}

export type MemoryType =
  | 'hook_pattern' | 'topic_signal' | 'hashtag' | 'thumbnail_style' | 'dont';

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  hook_pattern:    'Hook pattern',
  topic_signal:    'Topic signal',
  hashtag:         'Hashtag',
  thumbnail_style: 'Thumbnail style',
  dont:            'Avoid',
};

export const MEMORY_TYPE_EMOJI: Record<MemoryType, string> = {
  hook_pattern:    '🎯',
  topic_signal:    '📰',
  hashtag:         '#️⃣',
  thumbnail_style: '🎨',
  dont:            '🚫',
};

export interface Memory {
  id: string;
  vertical: AiPulseVertical;
  memory_type: MemoryType;
  content: string;
  evidence: string[];
  applies_to: string[];
  is_active: boolean;
  created_at: string;
}

export interface PostmortemContent {
  worked?: string[];
  didntWork?: string[];
  next?: string[];
  reusableHookPattern?: string;
  winningThumbnailStyle?: string;
  topicSignal?: string;
  winningHashtags?: string[];
}

export interface Postmortem {
  id: string;
  script_id: string;
  vertical: AiPulseVertical;
  content: PostmortemContent;
  model_used: string | null;
  cost_usd: number | string;
  created_at: string;
}

// ── Scenes (blueprint-aligned per-scene JSON + audio block) ─────────────
export interface AiPulseScene {
  scene_id:             string;
  duration_seconds:     number;
  spoken_text:          string;
  setting:              string;
  subject:              string;
  shot:                 string;
  lighting:             string;
  mood:                 string;
  style:                string;
  character_dna:        string;
  reference_image_url?: string | null;
}

export interface AiPulseVoiceoverSpec {
  full_text:    string;
  voice_style:  string;
  pacing_notes: string;
}

export interface AiPulseMusicSpec {
  style:          string;
  tempo:          string;
  mood:           string;
  minimax_prompt: string;
}

export interface AiPulseScenesPayload {
  scenes:             AiPulseScene[];
  scene_count:        number;
  total_duration_sec: number;
  voiceover:          AiPulseVoiceoverSpec;
  music:              AiPulseMusicSpec;
}

export interface Script {
  id: string;
  news_item_id: string;
  vertical: AiPulseVertical;
  english_title: string | null;
  english_hook: string | null;
  english_full_script: string | null;
  english_word_count: number | null;
  telugu_title: string | null;
  telugu_hook: string | null;
  telugu_full_script: string | null;
  telugu_word_count: number | null;
  llm_model: string | null;
  llm_cost_usd: number | string;
  thumbnail_prompts: ThumbnailPrompt[];
  distribution_package: DistributionPackage | null;
  telugu_distribution_package: DistributionPackage | null;
  scenes: AiPulseScenesPayload | null;
  scenes_generated_at: string | null;
  scenes_cost_usd: number | string;
  approval_status: 'pending_review' | 'approved' | 'rejected' | 'published';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  english_video_url: string | null;
  telugu_video_url: string | null;
  english_video_status: string;
  telugu_video_status: string;
  published_at: string | null;
  created_at: string;
  news_item?: NewsItem;
}

export async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/token');
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token?: string };
    return token ?? null;
  } catch {
    return null;
  }
}

export function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  return fetch(`/api/v1/admin/ai-pulse${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message ?? `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  });
}
