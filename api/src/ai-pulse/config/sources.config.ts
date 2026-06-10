import { AiPulseVertical } from '../entities/news-item.entity';

export interface SourceSpec {
  display_name: string;
  type: 'rss' | 'api' | 'scraper';
  url: string;
  vertical: AiPulseVertical;
  weight: number;                  // 0..1, used in scoring
  keyword_filter?: string[];       // require any of these terms in title/summary
  enabled?: boolean;               // default true; set false to skip without removing
  note?: string;                   // human-readable why-this-source
}

/**
 * Phased-rollout note: only tech_industry sources are wired with
 * real RSS endpoints today. The other verticals are placeholders
 * with weight 0 until the curator enables them via vertical config.
 *
 * Layoffs.fyi + Levels.fyi + Bloomberg Tech do NOT expose a free RSS
 * feed — they're listed in the spec but require a paid scraper /
 * API key we haven't onboarded yet. They're scaffolded with
 * enabled=false so the curator sees the slot.
 */
export const SOURCES: Record<string, SourceSpec> = {
  // ── tech_industry (ACTIVE) ────────────────────────────────────────
  techcrunch_tech: {
    display_name: 'TechCrunch',
    type: 'rss',
    url: 'https://techcrunch.com/feed/',
    vertical: 'tech_industry',
    weight: 0.9,
    keyword_filter: ['hiring', 'layoff', 'jobs', 'salary', 'engineer', 'workforce', 'AI'],
    enabled: true,
    note: 'Big Tech hiring + layoff coverage.',
  },
  crunchbase_news: {
    display_name: 'Crunchbase News',
    type: 'rss',
    url: 'https://news.crunchbase.com/feed/',
    vertical: 'tech_industry',
    weight: 0.85,
    keyword_filter: ['hiring', 'layoff', 'workforce', 'jobs'],
    enabled: true,
    note: 'Funding rounds often signal hiring waves.',
  },
  inc42_funding: {
    display_name: 'Inc42',
    type: 'rss',
    url: 'https://inc42.com/feed/',
    vertical: 'tech_industry',
    weight: 0.85,
    keyword_filter: ['TCS', 'Infosys', 'Wipro', 'HCL', 'hiring', 'layoff', 'IT services'],
    enabled: true,
    note: 'Indian IT services coverage.',
  },
  layoffs_fyi: {
    display_name: 'Layoffs.fyi',
    type: 'scraper',
    url: 'https://layoffs.fyi/',
    vertical: 'tech_industry',
    weight: 1.0,
    enabled: false,
    note: 'No RSS — paid scraper required. Enable once onboarded.',
  },
  levels_fyi: {
    display_name: 'Levels.fyi',
    type: 'scraper',
    url: 'https://www.levels.fyi/',
    vertical: 'tech_industry',
    weight: 0.9,
    enabled: false,
    note: 'No RSS — scraper required.',
  },
  bloomberg_tech: {
    display_name: 'Bloomberg Tech',
    type: 'rss',
    url: 'https://feeds.bloomberg.com/technology/news.rss',
    vertical: 'tech_industry',
    weight: 0.95,
    keyword_filter: ['hiring', 'layoff', 'workforce', 'tech jobs'],
    enabled: false,
    note: 'Paywall on most articles — enable if subscription onboarded.',
  },
  the_verge_tech: {
    display_name: 'The Verge',
    type: 'rss',
    url: 'https://www.theverge.com/rss/index.xml',
    vertical: 'tech_industry',
    weight: 0.85,
    keyword_filter: ['hiring', 'layoff', 'workforce', 'jobs', 'salary'],
    enabled: true,
    note: 'Broad tech-industry coverage (US-leaning).',
  },
  ars_technica_tech: {
    display_name: 'Ars Technica',
    type: 'rss',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    vertical: 'tech_industry',
    weight: 0.85,
    keyword_filter: ['hiring', 'layoff', 'workforce', 'jobs', 'engineer'],
    enabled: true,
    note: 'Deeper-tech coverage, often picks up workforce trends earlier.',
  },

  // ── ai_business (SCAFFOLDED, disabled) ─────────────────────────────
  techcrunch_business: {
    display_name: 'TechCrunch — Startups',
    type: 'rss',
    url: 'https://techcrunch.com/category/startups/feed/',
    vertical: 'ai_business',
    weight: 0.9,
    keyword_filter: ['AI', 'artificial intelligence', 'GenAI', 'LLM'],
    enabled: false,
  },
  inc42_business: {
    display_name: 'Inc42 — AI Startups',
    type: 'rss',
    url: 'https://inc42.com/feed/',
    vertical: 'ai_business',
    weight: 0.9,
    keyword_filter: ['AI', 'GenAI', 'artificial intelligence', 'funding'],
    enabled: false,
  },
  yourstory_business: {
    display_name: 'YourStory',
    type: 'rss',
    url: 'https://yourstory.com/feed',
    vertical: 'ai_business',
    weight: 0.8,
    keyword_filter: ['AI', 'artificial intelligence', 'funding', 'startup'],
    enabled: false,
  },

  // ── ai_science (SCAFFOLDED, disabled) ──────────────────────────────
  mit_tech_review: {
    display_name: 'MIT Technology Review',
    type: 'rss',
    url: 'https://www.technologyreview.com/feed/',
    vertical: 'ai_science',
    weight: 0.95,
    keyword_filter: ['AI', 'machine learning', 'research'],
    enabled: false,
  },
  the_hindu_science: {
    display_name: 'The Hindu — Science',
    type: 'rss',
    url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss',
    vertical: 'ai_science',
    weight: 0.85,
    keyword_filter: ['AI', 'artificial intelligence', 'ISRO', 'IIT'],
    enabled: false,
  },

  // ── ai_education (SCAFFOLDED, disabled) ────────────────────────────
  education_times: {
    display_name: 'Education Times',
    type: 'rss',
    url: 'https://www.educationtimes.com/rssfeed/all-news',
    vertical: 'ai_education',
    weight: 0.75,
    keyword_filter: ['AI', 'artificial intelligence', 'data science'],
    enabled: false,
  },

  // ── ai_society (SCAFFOLDED, disabled) ──────────────────────────────
  medianama_society: {
    display_name: 'MediaNama',
    type: 'rss',
    url: 'https://www.medianama.com/feed/',
    vertical: 'ai_society',
    weight: 0.9,
    keyword_filter: ['AI', 'deepfake', 'regulation', 'IT Rules'],
    enabled: false,
  },
  indian_express_society: {
    display_name: 'Indian Express',
    type: 'rss',
    url: 'https://indianexpress.com/feed/',
    vertical: 'ai_society',
    weight: 0.8,
    keyword_filter: ['AI', 'artificial intelligence', 'deepfake'],
    enabled: false,
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES);
