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
