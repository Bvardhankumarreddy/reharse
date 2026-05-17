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

/** Raw shape returned by the LLM (before URL injection + source ref). */
export interface DistributionLlmResponse {
  youtube: YouTubeShortMeta;
  instagram: InstagramPost;
  linkedin: LinkedInPost;
  whatsapp_channel: WhatsAppChannelPost;
  whatsapp_status: WhatsAppStatus;
}

export interface ThumbnailPromptResult {
  prompt: string;       // copy-paste into ChatGPT/DALL-E
  overlayText: string;  // big bold text to put on the thumbnail
}
