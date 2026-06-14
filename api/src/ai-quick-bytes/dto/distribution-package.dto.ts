export interface YouTubeShortMeta {
  title: string;        // ≤60 chars for Shorts
  description: string;  // full description with links + tags
  tags: string[];       // 10-15 SEO tags (no #)
}

export interface InstagramPost {
  caption: string;
  hashtags: string[];
  full_text: string;    // caption + hashtags, ready to paste
}

export interface LinkedInPost {
  body: string;
  hashtags: string[];
  full_text: string;
}

export interface WhatsAppChannelPost {
  full_text: string;
}

export interface WhatsAppStatus {
  full_text: string;    // ≤50 words
}

export interface SourceReference {
  title: string;
  url: string;
  source_name: string;
}

export interface DistributionPackage {
  youtube: YouTubeShortMeta;
  instagram: InstagramPost;
  linkedin: LinkedInPost;
  whatsapp_channel: WhatsAppChannelPost;
  whatsapp_status: WhatsAppStatus;
  source_reference: SourceReference;
  generated_at: string;
}

/** Raw shape returned by the LLM (before URL injection + source ref).
 *  Selective regeneration may omit some keys, so all are optional here. */
export interface DistributionLlmResponse {
  youtube?: YouTubeShortMeta;
  instagram?: InstagramPost;
  linkedin?: LinkedInPost;
  whatsapp_channel?: WhatsAppChannelPost;
  whatsapp_status?: WhatsAppStatus;
}

/** Platforms the distribution generator can target. */
export type DistributionPlatform =
  | 'youtube' | 'instagram' | 'linkedin'
  | 'whatsapp_channel' | 'whatsapp_status';

export const ALL_DISTRIBUTION_PLATFORMS: DistributionPlatform[] = [
  'youtube', 'instagram', 'linkedin', 'whatsapp_channel', 'whatsapp_status',
];

/** Human-readable labels (used in prompts + UI tooltips). */
export const DISTRIBUTION_PLATFORM_LABELS: Record<DistributionPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  whatsapp_channel: 'WhatsApp Channel',
  whatsapp_status: 'WhatsApp Status',
};

export type ThumbnailStyle =
  // NEW (Jun-26 creative rethink — tuned for educated Indian tech viewers)
  | 'data_reveal'        // hero number / stat dominates ($300B, 10×, 94%)
  | 'product_screenshot' // real annotated screenshot, one element circled in red
  | 'versus'             // two logos / products face off (ChatGPT vs Claude)
  | 'identity_target'    // calls out viewer identity ("For BTech CSE")
  | 'question_hook'      // massive provocative question, minimal visual
  // EXISTING (retained for variety + back-compat with old rows)
  | 'visual_metaphor'    // one strong prop tells the story
  | 'bold_text'          // pure typography, headline IS the design
  | 'shocked_reaction'   // classic MrBeast face — used sparingly now
  | 'brand_signature';   // the richer futuristic AetherStackAI house look

export interface ThumbnailVariation {
  style: ThumbnailStyle;
  headline: string;          // ≤6 words, ALL CAPS overlay text (English)
  teluguHeadline?: string;   // ≤6 words Telugu overlay (for the Telugu video)
  prompt: string;            // clean 100-150 word ChatGPT/DALL-E prompt (English — DALL-E renders English better)
  reasoning: string;         // 1 sentence: why this style fits
  estimatedCtrScore: number; // 1-100
}

export interface ThumbnailPromptResult {
  variations: ThumbnailVariation[]; // 4-5 distinct styles, story-type-aware
}
