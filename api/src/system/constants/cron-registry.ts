/**
 * Canonical list of every scheduled cron the platform runs.
 * Single source of truth used by:
 *   - CronGateService.isPaused(key) → check flag by key
 *   - SystemController → surface the list + per-key toggle to the admin UI
 *   - Each worker → pass its own key into isPaused() at TICK time
 *
 * Adding a new cron?
 *   1. Add a new entry here.
 *   2. Import CRON_KEYS.<yours> into your worker and gate the TICK
 *      handler with `if (await gate.isPaused(CRON_KEYS.<yours>))`.
 *   3. The admin UI auto-lists it.
 */
export interface CronDescriptor {
  key:      string;   // stable identifier, also used as DB key
  label:    string;   // human-readable name shown in the UI
  module:   string;   // grouping label
  schedule: string;   // human-readable cron summary (documentation only)
}

export const CRON_REGISTRY: readonly CronDescriptor[] = [
  // AQB
  { key: 'aqb.ingestion',   label: 'Ingestion (news fetch)',        module: 'AQB', schedule: 'every 30 min' },
  { key: 'aqb.scoring',     label: 'Scoring (LLM rank)',             module: 'AQB', schedule: ':15 & :45 hourly' },
  { key: 'aqb.script-gen',  label: 'Script generation (daily top)',  module: 'AQB', schedule: 'daily 05:30 UTC' },
  { key: 'aqb.metrics',     label: 'Metrics sweep (YouTube stats)',  module: 'AQB', schedule: 'hourly :20' },
  { key: 'aqb.postmortem',  label: 'Postmortem sweep',               module: 'AQB', schedule: 'daily 04:30 UTC' },
  { key: 'aqb.improvement', label: 'Improvement sweep',              module: 'AQB', schedule: 'daily 06:00 UTC' },

  // AI Pulse
  { key: 'ai-pulse.ingest',      label: 'Ingest (news fetch)',        module: 'AI Pulse', schedule: 'every 4h' },
  { key: 'ai-pulse.generate',    label: 'Script generation (daily)',  module: 'AI Pulse', schedule: 'daily 00:30 UTC' },
  { key: 'ai-pulse.metrics',     label: 'Metrics sweep',              module: 'AI Pulse', schedule: 'hourly :20' },
  { key: 'ai-pulse.postmortem',  label: 'Postmortem sweep',           module: 'AI Pulse', schedule: 'daily 04:30 UTC' },
  { key: 'ai-pulse.improvement', label: 'Improvement sweep',          module: 'AI Pulse', schedule: 'daily 06:00 UTC' },

  // Content Studio
  { key: 'cs.competitor',  label: 'Competitor sweep',        module: 'Content Studio', schedule: 'daily 03:00 UTC' },
  { key: 'cs.channel',     label: 'Own-channel sweep',       module: 'Content Studio', schedule: 'daily 02:30 UTC' },
  { key: 'cs.metrics',     label: 'Metrics sweep',           module: 'Content Studio', schedule: 'hourly :15' },
  { key: 'cs.postmortem',  label: 'Postmortem sweep',        module: 'Content Studio', schedule: 'daily 04:00 UTC' },
  { key: 'cs.improvement', label: 'Improvement sweep',       module: 'Content Studio', schedule: 'Mondays 05:00 UTC' },
  { key: 'cs.retention',   label: 'Retention purge (archive+delete)', module: 'Content Studio', schedule: 'Mondays 03:30 UTC' },

  // Careers
  { key: 'careers.ingestion', label: 'Job listings ingestion', module: 'Careers', schedule: 'every 6h' },

  // Quiz
  { key: 'quiz.notify', label: 'Notify due subscribers',    module: 'Quiz', schedule: 'every 5 min' },
  { key: 'quiz.prune',  label: 'Prune notified log',        module: 'Quiz', schedule: 'Mondays 03:00 UTC' },

  // Social agent
  { key: 'social.publish',    label: 'Publish approved scheduled posts', module: 'Social', schedule: 'every minute' },
  { key: 'social.engagement', label: 'Engagement stats sync',            module: 'Social', schedule: 'hourly :15' },
  { key: 'social.audience',   label: 'Audience demographics snapshot',   module: 'Social', schedule: 'Mondays 07:00 UTC' },
  { key: 'social.insights',   label: 'Claude-generated insights',        module: 'Social', schedule: 'daily 06:30 UTC' },

  // Rehearse core jobs
  { key: 'jobs.weekly-digest', label: 'Weekly digest fanout', module: 'Rehearse Core', schedule: 'Mondays 08:00 UTC' },
];

/** Typed string constants — workers import these so a typo is a compile
 *  error, not a silently-un-gated cron. */
export const CRON_KEYS = {
  AQB_INGESTION:   'aqb.ingestion',
  AQB_SCORING:     'aqb.scoring',
  AQB_SCRIPT_GEN:  'aqb.script-gen',
  AQB_METRICS:     'aqb.metrics',
  AQB_POSTMORTEM:  'aqb.postmortem',
  AQB_IMPROVEMENT: 'aqb.improvement',

  AI_PULSE_INGEST:      'ai-pulse.ingest',
  AI_PULSE_GENERATE:    'ai-pulse.generate',
  AI_PULSE_METRICS:     'ai-pulse.metrics',
  AI_PULSE_POSTMORTEM:  'ai-pulse.postmortem',
  AI_PULSE_IMPROVEMENT: 'ai-pulse.improvement',

  CS_COMPETITOR:  'cs.competitor',
  CS_CHANNEL:     'cs.channel',
  CS_METRICS:     'cs.metrics',
  CS_POSTMORTEM:  'cs.postmortem',
  CS_IMPROVEMENT: 'cs.improvement',
  CS_RETENTION:   'cs.retention',

  CAREERS_INGESTION: 'careers.ingestion',

  QUIZ_NOTIFY: 'quiz.notify',
  QUIZ_PRUNE:  'quiz.prune',

  SOCIAL_PUBLISH:    'social.publish',
  SOCIAL_ENGAGEMENT: 'social.engagement',
  SOCIAL_AUDIENCE:   'social.audience',
  SOCIAL_INSIGHTS:   'social.insights',

  JOBS_WEEKLY_DIGEST: 'jobs.weekly-digest',
} as const;

export type CronKey = (typeof CRON_KEYS)[keyof typeof CRON_KEYS];
