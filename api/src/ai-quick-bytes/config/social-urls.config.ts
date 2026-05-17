/**
 * Hardcoded social media URLs + brand info for AetherStackAI.
 * Used across all distribution posts. To change a URL, edit it here only —
 * the LLM uses {{PLACEHOLDER}} tokens that get replaced with these values.
 */
export const SOCIAL_URLS = {
  youtube: 'youtube.com/@aetherstackai',
  instagram: 'instagram.com/aetherstackai',
  linkedin: 'linkedin.com/company/115524370',
  whatsapp_channel: 'whatsapp.com/channel/0029Vb7dRgq1dAwCydDr651d',
  rehearse_platform: 'reharse.inferix.in',
  rehearse_quiz: 'reharse.inferix.in/quiz',
} as const;

export const BRAND_INFO = {
  channel_name: 'AetherStackAI',
  series_name: 'AI Quick Bytes',
  host_name: 'Vardhan',
  host_full_name: 'Vardhan Kumar Reddy',
  tagline: 'The AI that teaches AI',
  contact_phone: '8919573936',
} as const;

export const DEFAULT_HASHTAGS = {
  common: ['#AI', '#AIQuickBytes', '#AetherStackAI'],
  youtube: ['#AI', '#AIShorts', '#AIQuickBytes', '#AetherStackAI', '#Shorts'],
  instagram: [
    '#AI', '#ChatGPT', '#AIQuickBytes', '#AetherStackAI',
    '#LearnAI', '#PromptEngineering', '#AIIndia', '#VardhanAI',
    '#TechIndia', '#AIShorts',
  ],
  linkedin: ['#AI', '#ArtificialIntelligence', '#TechNews', '#Innovation', '#FutureOfWork'],
  whatsapp: [] as string[],
};
