import { registerAs } from '@nestjs/config';

/**
 * Cost-tier presets (Phase C). Picked via `CS_TIER`. A per-task env var
 * (e.g. `CS_SCRIPT_MODEL`) wins over the tier default. Per-brand overrides
 * (cs_brands.modelOverrides) win over both.
 */
type TaskKey =
  | 'strategy' | 'script' | 'ppt' | 'quiz'
  | 'seo' | 'thumbnail' | 'promo' | 'quiz_validator' | 'grader';

export const TIER_DEFAULTS: Record<'standard' | 'cheap' | 'premium', Record<TaskKey, string>> = {
  standard: {
    strategy:       'claude-sonnet-4-6',
    script:         'claude-sonnet-4-6',
    ppt:            'claude-sonnet-4-6',
    quiz:           'claude-sonnet-4-6',
    seo:            'gpt-4o-mini',
    thumbnail:      'claude-sonnet-4-6',
    promo:          'gpt-4o-mini',
    quiz_validator: 'gpt-4o-mini',
    grader:         'gpt-4o-mini',
  },
  cheap: {
    strategy:       'gpt-4o-mini',
    script:         'gpt-4o-mini',
    ppt:            'gpt-4o-mini',
    quiz:           'gpt-4o-mini',
    seo:            'gpt-4o-mini',
    thumbnail:      'gpt-4o-mini',
    promo:          'gpt-4o-mini',
    // Validator MUST cross-provide the generator — flip to Claude here.
    quiz_validator: 'claude-sonnet-4-6',
    grader:         'gpt-4o-mini',
  },
  premium: {
    strategy:       'claude-opus-4-7',
    script:         'claude-sonnet-4-6',
    ppt:            'claude-sonnet-4-6',
    quiz:           'claude-opus-4-7',
    seo:            'gpt-4o-mini',
    thumbnail:      'claude-sonnet-4-6',
    promo:          'gpt-4o-mini',
    quiz_validator: 'gpt-4o-mini',
    grader:         'gpt-4o-mini',
  },
};

const TIER = (process.env.CS_TIER ?? 'standard') as keyof typeof TIER_DEFAULTS;
const tierDefault = (task: TaskKey): string =>
  TIER_DEFAULTS[TIER]?.[task] ?? TIER_DEFAULTS.standard[task];

/**
 * Namespaced config for Content Studio. ConfigModule.forFeature() in the
 * module. Access: config.get('contentStudio.<path>').
 *
 * Default model map follows the locked spec (Strategy → Opus on premium)
 * but every model is env-overridable; per-brand overrides win over env.
 */
export default registerAs('contentStudio', () => ({
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    /** DALL-E variant for thumbnails (Phase D). */
    imageModel: process.env.CS_IMAGE_MODEL ?? 'dall-e-3',
    imageSize: process.env.CS_IMAGE_SIZE ?? '1792x1024',
  },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  gemini: { apiKey: process.env.GEMINI_API_KEY },

  /**
   * Phase D — YouTube. Data API is read-only and only needs an API key;
   * Analytics + auto-publish + comments need an OAuth refresh token and
   * are dormant when CS_YT_OAUTH_REFRESH_TOKEN is missing.
   */
  youtube: {
    apiKey:           process.env.CS_YT_API_KEY,
    oauthRefreshToken: process.env.CS_YT_OAUTH_REFRESH_TOKEN,
    oauthClientId:     process.env.CS_YT_OAUTH_CLIENT_ID,
    oauthClientSecret: process.env.CS_YT_OAUTH_CLIENT_SECRET,
  },

  /** Reported back to the admin UI for visibility. */
  tier: TIER,

  // task → model. Per-task env var > tier default. Per-call modelOverride
  // (per-brand) still wins over both, applied in the Router.
  models: {
    strategy:       process.env.CS_STRATEGY_MODEL        ?? tierDefault('strategy'),
    script:         process.env.CS_SCRIPT_MODEL          ?? tierDefault('script'),
    ppt:            process.env.CS_PPT_MODEL             ?? tierDefault('ppt'),
    quiz:           process.env.CS_QUIZ_MODEL            ?? tierDefault('quiz'),
    seo:            process.env.CS_SEO_MODEL             ?? tierDefault('seo'),
    thumbnail:      process.env.CS_THUMBNAIL_MODEL       ?? tierDefault('thumbnail'),
    promo:          process.env.CS_PROMO_MODEL           ?? tierDefault('promo'),
    /** Quiz validator — cross-provider, enforced via excludeProvider in Router. */
    quiz_validator: process.env.CS_QUIZ_VALIDATOR_MODEL  ?? tierDefault('quiz_validator'),
    /** Phase B Grader — cheap second-pass critic. */
    grader:         process.env.CS_GRADER_MODEL          ?? tierDefault('grader'),
  },

  /** Phase B — auto-revise loop. */
  grader: {
    /** Asset passes if qualityScore ≥ this. */
    threshold: Number(process.env.CS_GRADER_THRESHOLD ?? 70),
    /** Max revise passes per asset (spec: "up to 2"). */
    maxRevisions: Number(process.env.CS_MAX_REVISIONS ?? 2),
    /**
     * always       — grade every asset type
     * smart        — grade Script + PPT + Quiz (default; the expensive ones)
     * premium-only — grade only Script
     * manual       — never grade automatically
     */
    selfCritiqueMode: (process.env.CS_SELF_CRITIQUE_MODE ?? 'smart') as
      'always' | 'smart' | 'premium-only' | 'manual',
  },

  budgets: {
    perPlanUsd: Number(process.env.CS_PLAN_BUDGET_USD ?? 10),
    perMonthUsd: Number(process.env.CS_MONTH_BUDGET_USD ?? 100),
  },

  timeouts: {
    // Defaults match the spec's per-agent budgets. Each is env-overridable.
    strategy:       Number(process.env.CS_STRATEGY_TIMEOUT_MS       ?? 120_000),
    script:         Number(process.env.CS_SCRIPT_TIMEOUT_MS         ?? 90_000),
    ppt:            Number(process.env.CS_PPT_TIMEOUT_MS            ?? 60_000),
    quiz:           Number(process.env.CS_QUIZ_TIMEOUT_MS           ?? 180_000),
    quiz_validator: Number(process.env.CS_QUIZ_VALIDATOR_TIMEOUT_MS ?? 30_000),
    seo:            Number(process.env.CS_SEO_TIMEOUT_MS            ?? 45_000),
    thumbnail:      Number(process.env.CS_THUMBNAIL_TIMEOUT_MS      ?? 45_000),
    promo:          Number(process.env.CS_PROMO_TIMEOUT_MS          ?? 45_000),
    grader:         Number(process.env.CS_GRADER_TIMEOUT_MS         ?? 45_000),
    /** Used when a task has no specific entry above. */
    default:        Number(process.env.CS_DEFAULT_TIMEOUT_MS        ?? 90_000),
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
