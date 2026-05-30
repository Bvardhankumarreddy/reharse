import { registerAs } from '@nestjs/config';

/**
 * Namespaced config for the ai-quick-bytes module. Registered via
 * ConfigModule.forFeature() in the module so it does not affect global config.
 * Access with config.get('aiQuickBytes.<path>').
 */
export default registerAs('aiQuickBytes', () => ({
  // OpenAI: scoring (cheap) + embeddings (Claude has no embeddings API) +
  // translation (Telugu — gpt-4o is reliable on Indic + code-mixing).
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    scoringModel: process.env.AQB_SCORING_MODEL ?? 'gpt-4o-mini',
    embeddingModel: process.env.AQB_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    translationModel: process.env.AQB_TRANSLATION_MODEL ?? 'gpt-4o',
  },

  // Anthropic: all the writing steps — script, thumbnail prompt, distribution.
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    writeModel: process.env.AQB_WRITE_MODEL ?? 'claude-sonnet-4-6',
  },

  // Telugu auto-generation knobs. The Telugu transcript ALWAYS auto-runs
  // when OpenAI is configured (cheap, useful for manual recording). The
  // heavier outputs are independently gated:
  //   - AQB_TELUGU_AUTO_VIDEO         on approve, queue Telugu HeyGen video
  //   - AQB_TELUGU_AUTO_DISTRIBUTION  after translation, LLM-generate the
  //                                   5 Telugu social posts
  //   - AQB_TELUGU_FULL_TRACK         legacy umbrella — turns BOTH on when
  //                                   true; specific flags above win.
  // Manual endpoints still work regardless of the flags.
  telugu: {
    autoVideo:
      ((process.env.AQB_TELUGU_AUTO_VIDEO
        ?? process.env.AQB_TELUGU_FULL_TRACK
        ?? 'false') as string).toLowerCase() === 'true',
    autoDistribution:
      ((process.env.AQB_TELUGU_AUTO_DISTRIBUTION
        ?? process.env.AQB_TELUGU_FULL_TRACK
        ?? 'false') as string).toLowerCase() === 'true',
  },

  heygen: {
    apiKey: process.env.HEYGEN_API_KEY,
    baseUrl: process.env.HEYGEN_BASE_URL ?? 'https://api.heygen.com/v2',
    webhookSecret: process.env.HEYGEN_WEBHOOK_SECRET,
    avatars: {
      cyber: process.env.HEYGEN_AVATAR_CYBER_ID,
      robot: process.env.HEYGEN_AVATAR_ROBOT_ID,
      vardhan: process.env.HEYGEN_AVATAR_VARDHAN_ID,
    },
    voiceClone: {
      vardhan: process.env.HEYGEN_VOICE_VARDHAN_ID,
    },
    // Telugu voice ids per avatar key — used by the Telugu HeyGen track.
    // If none is set, the Telugu video step is skipped (translation still
    // runs so the script + transcript are available).
    voicesTelugu: {
      cyber:   process.env.HEYGEN_VOICE_CYBER_TE_ID,
      robot:   process.env.HEYGEN_VOICE_ROBOT_TE_ID,
      vardhan: process.env.HEYGEN_VOICE_VARDHAN_TE_ID,
    },
  },

  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
    channelId: process.env.YOUTUBE_CHANNEL_ID,
  },

  appUrl: process.env.APP_URL ?? 'https://reharse.inferix.in',

  limits: {
    maxStoriesPerDay: Number(process.env.AQB_MAX_STORIES_PER_DAY ?? 50),
    maxScriptsPerDay: Number(process.env.AQB_MAX_SCRIPTS_PER_DAY ?? 10),
    maxPublishPerDay: Number(process.env.AQB_MAX_PUBLISH_PER_DAY ?? 4),
    duplicateSimilarityThreshold: Number(
      process.env.AQB_DUP_SIMILARITY_THRESHOLD ?? 0.85,
    ),
    // Only ingest stories published within this many hours. Keeps the channel
    // focused on fresh news and stops archive feeds (e.g. OpenAI's sitewide
    // feed) from dumping years of old posts. Default 48h.
    freshnessHours: Number(process.env.AQB_FRESHNESS_HOURS ?? 48),
  },

  costGuardrails: {
    dailyLLMBudgetUSD: Number(process.env.AQB_DAILY_LLM_BUDGET_USD ?? 5),
    monthlyTotalBudgetUSD: Number(process.env.AQB_MONTHLY_BUDGET_USD ?? 100),
  },
}));
