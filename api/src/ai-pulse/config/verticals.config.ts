import { AiPulseVertical } from '../entities/news-item.entity';

export interface VerticalSpec {
  display_name: string;
  description: string;
  day_of_week: number[];     // 0=Sun, 1=Mon..6=Sat
  publish_time: string;      // HH:mm IST
  tone: string;
  target_audience: string;
  style_keywords: string[];
  forbidden_topics: string[];
  india_mix_percent: number; // 0..100 — share of content with India-specific angle
  top_n_per_run: number;     // how many top-scored stories become scripts per run (matches AQB pattern)
  enabled: boolean;          // phased rollout — only tech_industry is true at launch
}

export const VERTICALS: Record<AiPulseVertical, VerticalSpec> = {
  // World-first editorial orientation (June 2026 update):
  // Cover what's happening globally; India is ONE perspective among
  // many, not the dominant frame. india_mix_percent stays low across
  // the board — the only exception is ai_education, which is hybrid
  // by design ("here's the global tool, here's how to use it").
  ai_business: {
    display_name: 'AI Business',
    description: 'AI startups worldwide — funding rounds, launches, acquisitions, M&A',
    day_of_week: [1], // Monday
    publish_time: '06:00',
    tone: 'aspirational, founder-friendly, data-backed',
    target_audience: 'founders, operators, builders (globally; viewing from India)',
    style_keywords: ['startup', 'funding', 'launch', 'acquisition', 'globalai'],
    forbidden_topics: ['unverified rumor', 'negative VC gossip'],
    india_mix_percent: 20,
    top_n_per_run: 3,
    enabled: true,
  },
  tech_industry: {
    display_name: 'Tech Industry',
    description: 'Tech jobs worldwide — hiring sprees, layoffs, salary moves at Big Tech + global IT',
    day_of_week: [2, 4], // Tuesday + Thursday
    publish_time: '06:00',
    tone: 'career-actionable, data-driven, optimistic-realistic',
    target_audience: 'engineers, jobseekers, IT workers (viewing from India)',
    style_keywords: ['hiring', 'layoff', 'salary', 'jobs', 'career'],
    forbidden_topics: ['gossip', 'unverified compensation rumors'],
    india_mix_percent: 20,
    top_n_per_run: 3,
    enabled: true,
  },
  ai_science: {
    display_name: 'AI Science',
    description: 'AI research worldwide — DeepMind, OpenAI, Nature AI, university labs',
    day_of_week: [3], // Wednesday
    publish_time: '06:00',
    tone: 'wonder-inspiring, accessible',
    target_audience: 'students, science enthusiasts, researchers (globally)',
    style_keywords: ['breakthrough', 'discovery', 'research'],
    forbidden_topics: ['military/defense applications'],
    india_mix_percent: 15,
    top_n_per_run: 3,
    enabled: true,
  },
  ai_education: {
    display_name: 'AI Education',
    description: 'Global AI edu tools (ChatGPT EDU, Khan Academy, NotebookLM) — hybrid: how to use them for Indian exams',
    day_of_week: [5], // Friday
    publish_time: '06:00',
    tone: 'practical, opportunity-focused, hands-on',
    target_audience: 'Indian students (UPSC, JEE, CBSE), teachers, career-changers',
    style_keywords: ['skill', 'tool', 'opportunity', 'upsc', 'jee', 'cbse'],
    forbidden_topics: ['exam rankings drama', 'coaching wars'],
    india_mix_percent: 50,
    top_n_per_run: 3,
    enabled: true,
  },
  ai_society: {
    display_name: 'AI Society',
    description: 'AI ethics + regulation worldwide — EU AI Act, deepfake laws, scams, policy shifts',
    day_of_week: [6], // Saturday
    publish_time: '06:00',
    tone: 'thoughtful, balanced, awareness-building',
    target_audience: 'general tech audience, parents, citizens',
    style_keywords: ['ethics', 'regulation', 'deepfake', 'scam', 'protect'],
    forbidden_topics: ['fear-mongering', 'partisan politics'],
    india_mix_percent: 20,
    top_n_per_run: 3,
    enabled: true,
  },
};

/** day-of-week → vertical (locked spec: Sun skipped — AQB runs). */
export const DAY_VERTICAL_MAP: Record<number, AiPulseVertical | null> = {
  0: null,             // Sunday → AI Quick Bytes runs instead
  1: 'ai_business',
  2: 'tech_industry',
  3: 'ai_science',
  4: 'tech_industry',  // Thursday repeats tech_industry per locked spec
  5: 'ai_education',
  6: 'ai_society',
};

export const VERTICAL_KEYS = Object.keys(VERTICALS) as AiPulseVertical[];
