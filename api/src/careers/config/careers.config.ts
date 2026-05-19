import { registerAs } from '@nestjs/config';

/**
 * Namespaced config for the careers (job-matching) module. Registered via
 * ConfigModule.forFeature() in the module. Access: config.get('careers.<path>').
 */
export default registerAs('careers', () => ({
  // OpenAI: job-description + resume embeddings (semantic match).
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.CAREERS_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  },

  // Anthropic: rerank + "why it fits you" rationale.
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    rerankModel: process.env.CAREERS_RERANK_MODEL ?? 'claude-sonnet-4-6',
  },

  // Adzuna aggregator — DORMANT until both keys are set (free tier:
  // https://developer.adzuna.com). country: 2-letter Adzuna country code.
  adzuna: {
    appId: process.env.CAREERS_ADZUNA_APP_ID,
    appKey: process.env.CAREERS_ADZUNA_APP_KEY,
    country: process.env.CAREERS_ADZUNA_COUNTRY ?? 'in',
    queries: (
      process.env.CAREERS_ADZUNA_QUERIES ??
      'software engineer,data scientist,product manager,frontend developer,backend developer'
    ).split(',').map((s) => s.trim()).filter(Boolean),
  },

  limits: {
    // Only keep listings posted within this many days.
    freshnessDays: Number(process.env.CAREERS_FRESHNESS_DAYS ?? 30),
    // pgvector candidates pulled before rerank.
    vectorTopK: Number(process.env.CAREERS_VECTOR_TOPK ?? 60),
    // How many the Claude reranker scores per refresh.
    rerankN: Number(process.env.CAREERS_RERANK_N ?? 15),
    // Minimum cosine similarity to consider a candidate at all.
    similarityFloor: Number(process.env.CAREERS_SIMILARITY_FLOOR ?? 0.15),
    // Don't recompute a user's matches more than once per N minutes.
    refreshCooldownMinutes: Number(process.env.CAREERS_REFRESH_COOLDOWN_MIN ?? 30),
  },
}));
