import { registerAs } from '@nestjs/config';

/**
 * Namespaced config for Content Studio. ConfigModule.forFeature() in the
 * module. Access: config.get('contentStudio.<path>').
 *
 * Default model map follows the locked spec (Strategy → Opus) but every
 * model is env-overridable so cost can be capped without code changes.
 */
export default registerAs('contentStudio', () => ({
  openai: { apiKey: process.env.OPENAI_API_KEY },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  gemini: { apiKey: process.env.GEMINI_API_KEY },

  // task → model. Provider is inferred from the model id prefix.
  models: {
    strategy: process.env.CS_STRATEGY_MODEL ?? 'claude-sonnet-4-6',
    script:   process.env.CS_SCRIPT_MODEL   ?? 'claude-sonnet-4-6',
    ppt:      process.env.CS_PPT_MODEL       ?? 'claude-sonnet-4-6',
    quiz:     process.env.CS_QUIZ_MODEL      ?? 'claude-sonnet-4-6',
    seo:      process.env.CS_SEO_MODEL       ?? 'gpt-4o-mini',
    promo:    process.env.CS_PROMO_MODEL     ?? 'gpt-4o-mini',
  },

  budgets: {
    perPlanUsd: Number(process.env.CS_PLAN_BUDGET_USD ?? 10),
    perMonthUsd: Number(process.env.CS_MONTH_BUDGET_USD ?? 100),
  },

  timeouts: {
    strategyMs: Number(process.env.CS_STRATEGY_TIMEOUT_MS ?? 120_000),
    defaultMs: Number(process.env.CS_DEFAULT_TIMEOUT_MS ?? 90_000),
  },
}));

/** Approx USD per 1M tokens [input, output]. Unknown model → 0 (logged). */
export const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3,    out: 15 },
  'claude-opus-4-7':   { in: 15,   out: 75 },
  'gpt-4o':            { in: 2.5,  out: 10 },
  'gpt-4o-mini':       { in: 0.15, out: 0.6 },
  'gemini-1.5-pro':    { in: 1.25, out: 5 },
  'gemini-1.5-flash':  { in: 0.075, out: 0.30 },
  'gemini-2.0-flash':  { in: 0.10,  out: 0.40 },
};
