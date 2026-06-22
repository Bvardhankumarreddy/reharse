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

// ── Per-vertical cinematic accent overlays for the scene generator ──────
// Each vertical's scenes overlay this accent ON TOP of the shared
// AI_PULSE_BRAND_VISUAL_STYLE base. Keeps every video feeling like one
// channel (shared cinematography: ARRI Alexa 65, shallow DoF, 9:16) while
// each vertical has its own visual identity that's recognisable at a
// glance — same as a news network with distinct studio sets per beat.
export interface VerticalSceneAccent {
  palette:           string;   // colours that dominate the grade
  settings:          string;   // recurring environments / locations
  props:             string;   // recurring objects + textures
  character_archetypes: string; // who tends to appear (generic roles, no likenesses)
  mood_default:      string;   // tonal baseline when the story is neutral
}

export const VERTICAL_SCENE_ACCENTS: Record<AiPulseVertical, VerticalSceneAccent> = {
  ai_business: {
    palette:    'deep navy + saffron gold accents + warm tungsten highlights',
    settings:   'corporate offices, glass conference rooms, financial-district skylines at dusk, founders\' garages, term-sheet tables',
    props:      'laptop on polished wood, fountain pens, signed paper documents, growth charts on glass walls, espresso cups, watch on wrist',
    character_archetypes: 'the founder (30s-40s, sharp casual, eye contact), the operator (anonymous over-shoulder), the investor (silhouette across table)',
    mood_default: 'aspirational, decisive, momentum-building',
  },
  tech_industry: {
    palette:    'deep navy + cyan glow + cool fluorescent overhead with warm accent lamps',
    settings:   'open-plan tech offices late at night, server rooms with cool lighting, home workstations in apartments, cafés with laptops, Bengaluru / Hyderabad skylines',
    props:      'multi-monitor setups, mechanical keyboards, sticky-noted dashboards, ID badges, coffee cups, ramen, code on screens, salary spreadsheets',
    character_archetypes: 'the engineer (late 20s-30s, hoodie or polo, glasses), the recruiter (anonymous LinkedIn-shape), the laid-off worker (closed laptop, packed box)',
    mood_default: 'measured, career-stakes, slightly weary but determined',
  },
  ai_science: {
    palette:    'deep navy + cosmic blue + bioluminescent green-cyan + deep starfield blacks',
    settings:   'university labs, ISRO mission control, particle accelerator corridors, chalkboard rooms, telescope domes, observatories, neural-net visualisations',
    props:      'whiteboards covered in equations, glass beakers, microscopes, scientific papers stacked, terminal output of training logs, satellite imagery',
    character_archetypes: 'the researcher (30s-40s, lab coat or sweater, focused), the grad student (younger, exhausted, energised by results), the lab tech (anonymous gloves + pipette)',
    mood_default: 'wonder-inspiring, careful, on the edge of discovery',
  },
  ai_education: {
    palette:    'deep navy + warm academic green + golden-hour window light',
    settings:   'study desks at 5 a.m., libraries, classrooms, coaching-centre walls in Kota / Hyderabad, exam halls, student bedrooms, JEE/NEET hostels',
    props:      'spiral notebooks dense with notes, highlighter sets, NCERT textbooks, mock test papers, laptop showing a study tool, snacks on a tray, alarm clock',
    character_archetypes: 'the student (17-22, school/college uniform or casual, focused), the teacher (40s, sari/shirt, kind), the parent (anxious, in doorway)',
    mood_default: 'aspirational, hopeful, quiet pressure',
  },
  ai_society: {
    palette:    'deep navy + warning amber + courtroom mahogany + cold-blue device screens',
    settings:   'newsrooms with breaking-news banners, courtrooms, parliament corridors, elderly people\'s living rooms with WhatsApp on phone, scam-call setups, EU offices',
    props:      'gavel, printed regulations, smartphone showing a suspicious message, news ticker, contract pages, microphone, magnifying glass over text',
    character_archetypes: 'the citizen (broadly relatable Indian, any age, wary), the policy maker (60s, formal attire), the scammer (faceless silhouette, only hands)',
    mood_default: 'thoughtful, balanced, awareness-building (never fear-mongering)',
  },
};
