import { registerAs } from '@nestjs/config';

/**
 * Namespaced config for the ai-squad module. The whole pipeline (themes,
 * topics, dialogue, thumbnails, distribution) runs on Claude — no OpenAI:
 * there is no embeddings/scoring step here, unlike ai-quick-bytes.
 */
export default registerAs('aiSquad', () => ({
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    writeModel: process.env.ASQ_WRITE_MODEL ?? 'claude-sonnet-4-6',
  },
  heygen: {
    apiKey: process.env.HEYGEN_API_KEY,
    baseUrl: process.env.HEYGEN_BASE_URL ?? 'https://api.heygen.com/v2',
    webhookSecret: process.env.HEYGEN_WEBHOOK_SECRET,
  },
  appUrl: process.env.APP_URL ?? 'https://reharse.inferix.in',
}));
