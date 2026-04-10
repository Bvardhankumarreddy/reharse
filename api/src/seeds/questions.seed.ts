/**
 * Question bank seed script.
 * Run: npm run seed              — skips if questions already exist
 * Run: npm run seed -- --force   — clears and re-seeds
 */

import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Question } from '../questions/question.entity';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// ── Seed data ─────────────────────────────────────────────────────────────────

type SeedQuestion = Pick<Question, 'type' | 'difficulty' | 'question' | 'modelAnswer' | 'tags' | 'companies' | 'roles'>;

const SEED: SeedQuestion[] = [

  // ── Behavioral ──────────────────────────────────────────────────────────────
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Tell me about a time you led a project that failed. What did you learn?',
    modelAnswer: 'Use STAR. Describe the project scope, your role, the root cause of failure, and concrete changes you made afterward.',
    tags: ['leadership', 'failure', 'growth'], companies: ['Google', 'Amazon', 'Meta'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Describe a situation where you had to influence stakeholders without direct authority.',
    modelAnswer: 'Focus on how you built alignment through data, storytelling, and empathy rather than positional power.',
    tags: ['influence', 'leadership', 'communication'], companies: ['Google', 'Microsoft'], roles: ['Software Engineer', 'Product Manager', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Tell me about a time you disagreed with your manager and how you handled it.',
    modelAnswer: 'Demonstrate respectful dissent: you gathered data, made your case clearly, and committed to the decision once it was made.',
    tags: ['conflict', 'communication', 'maturity'], companies: ['Amazon', 'Meta'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'hard',
    question: 'Give an example of when you had to make a critical decision with incomplete information.',
    modelAnswer: 'Show structured decision-making under uncertainty: identifying the knowns, estimating risks, making a time-boxed call, and tracking outcomes.',
    tags: ['decision-making', 'ambiguity', 'leadership'], companies: ['Google', 'Stripe', 'Amazon'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'easy',
    question: 'Tell me about a time you mentored or coached a team member.',
    modelAnswer: 'Highlight your approach to understanding their gap, the coaching technique you used, and the measurable outcome.',
    tags: ['mentorship', 'leadership', 'growth'], companies: ['Google', 'Amazon'], roles: ['Engineering Manager', 'Software Engineer'],
  },
  {
    type: 'behavioral', difficulty: 'hard',
    question: 'Describe your most significant technical achievement and its business impact.',
    modelAnswer: 'Quantify both the technical scope (scale, complexity) and business outcome (revenue, latency reduction, users served).',
    tags: ['impact', 'technical', 'achievement'], companies: ['Google', 'Meta', 'Stripe'], roles: ['Software Engineer'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Tell me about a time you had to deliver bad news to a stakeholder.',
    modelAnswer: 'Demonstrate transparency, empathy, proactive communication, and a clear plan to address the situation.',
    tags: ['communication', 'stakeholders', 'transparency'], companies: ['Amazon', 'Microsoft'], roles: ['Software Engineer', 'Engineering Manager', 'Product Manager'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Tell me about a time you navigated significant ambiguity in a project.',
    modelAnswer: 'Show how you clarified scope through questions, made assumptions explicit, and kept stakeholders aligned.',
    tags: ['ambiguity', 'problem-solving', 'leadership'], companies: ['Google', 'Meta'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'easy',
    question: 'Give an example of when you went above and beyond your core responsibilities.',
    modelAnswer: 'Describe why you chose to stretch, the impact it created, and what it cost you — showing that it was a deliberate trade-off.',
    tags: ['initiative', 'ownership', 'proactivity'], companies: ['Amazon', 'Google'], roles: ['Software Engineer'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Tell me about a time you had to adapt quickly to a significant change.',
    modelAnswer: 'Focus on your mindset shift, the specific adjustments you made, and how you helped others adapt as well.',
    tags: ['adaptability', 'change', 'resilience'], companies: ['Google', 'Amazon', 'Airbnb'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Describe a time you had to balance multiple competing high-priority projects.',
    modelAnswer: 'Show your prioritisation framework, how you communicated trade-offs, and what you de-prioritised and why.',
    tags: ['prioritisation', 'time-management', 'communication'], companies: ['Google', 'Amazon', 'Meta'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'easy',
    question: 'Tell me about a time you received critical feedback. How did you respond?',
    modelAnswer: 'Show self-awareness, openness, specific actions taken, and measurable improvement.',
    tags: ['feedback', 'growth', 'self-awareness'], companies: ['Google', 'Meta'], roles: ['Software Engineer'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Describe a time you built a strong working relationship with a difficult colleague.',
    modelAnswer: 'Highlight empathy, effort to understand their perspective, and the concrete steps that changed the dynamic.',
    tags: ['collaboration', 'conflict', 'empathy'], companies: ['Amazon', 'Microsoft'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'behavioral', difficulty: 'medium',
    question: 'Tell me about a time you took initiative to solve a problem no one asked you to.',
    modelAnswer: 'Emphasise how you identified the problem, made the case for solving it, and drove it to completion.',
    tags: ['initiative', 'ownership', 'proactivity'], companies: ['Google', 'Stripe'], roles: ['Software Engineer'],
  },
  {
    type: 'behavioral', difficulty: 'hard',
    question: 'Describe a situation where you had to work with very limited resources to achieve a goal.',
    modelAnswer: 'Show creative problem-solving, prioritisation, and how you maximised output with minimal input.',
    tags: ['resourcefulness', 'problem-solving', 'prioritisation'], companies: ['Stripe', 'Airbnb'], roles: ['Software Engineer', 'Engineering Manager'],
  },

  // ── Coding ───────────────────────────────────────────────────────────────────
  {
    type: 'coding', difficulty: 'easy',
    question: 'Given an array of integers, return indices of the two numbers that add up to a target sum.',
    modelAnswer: 'Use a hash map to store complements. O(n) time, O(n) space. Walk through edge cases: empty array, duplicates, negative numbers.',
    tags: ['array', 'hash-map', 'two-pointers'], companies: ['Google', 'Amazon', 'Meta'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'medium',
    question: 'Find the length of the longest substring without repeating characters.',
    modelAnswer: 'Sliding window with a set/map. O(n) time. Move left pointer when duplicate found, track max length.',
    tags: ['sliding-window', 'string', 'hash-map'], companies: ['Amazon', 'Microsoft'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'hard',
    question: 'Implement an LRU (Least Recently Used) Cache with O(1) get and put operations.',
    modelAnswer: 'Combine a HashMap (for O(1) access) with a doubly linked list (for O(1) insertion/deletion). HashMap stores key → node pointer.',
    tags: ['design', 'hash-map', 'linked-list'], companies: ['Meta', 'Amazon', 'Google'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'medium',
    question: 'Given a list of intervals, merge all overlapping intervals and return the result.',
    modelAnswer: 'Sort by start time. Iterate and compare current interval with last merged — extend end if overlapping.',
    tags: ['intervals', 'sorting', 'array'], companies: ['Google', 'Amazon'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'medium',
    question: 'Check if a binary tree is balanced (heights of left and right subtrees differ by at most 1).',
    modelAnswer: 'DFS returning height. Return -1 as sentinel for unbalanced. O(n) time bottom-up approach.',
    tags: ['binary-tree', 'dfs', 'recursion'], companies: ['Amazon', 'Google'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'medium',
    question: 'Find the k-th largest element in an unsorted array.',
    modelAnswer: 'QuickSelect (expected O(n)) or min-heap of size k (O(n log k)). Discuss trade-offs.',
    tags: ['sorting', 'heap', 'quickselect'], companies: ['Amazon', 'Meta'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'hard',
    question: 'Implement a function to serialize and deserialize a binary tree.',
    modelAnswer: 'BFS/pre-order with null markers. Serialise to string, deserialise by parsing with a queue/index pointer.',
    tags: ['binary-tree', 'bfs', 'design'], companies: ['Meta', 'Google'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'medium',
    question: 'Given a string, find all permutations and return them.',
    modelAnswer: 'Backtracking with a "used" boolean array or by swapping characters. Time O(n × n!).',
    tags: ['backtracking', 'recursion', 'string'], companies: ['Amazon', 'Microsoft'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'hard',
    question: 'Given a binary matrix, find the largest rectangle containing only 1s.',
    modelAnswer: 'Convert each row to a histogram (running height), then use the "largest rectangle in histogram" stack approach. O(m×n).',
    tags: ['dynamic-programming', 'stack', 'matrix'], companies: ['Google', 'Amazon'], roles: ['Software Engineer'],
  },
  {
    type: 'coding', difficulty: 'easy',
    question: 'Reverse a singly linked list.',
    modelAnswer: 'Iterative: three pointers (prev, curr, next). In-place, O(n) time, O(1) space. Also show recursive version.',
    tags: ['linked-list', 'iterative', 'recursion'], companies: ['Amazon', 'Apple'], roles: ['Software Engineer'],
  },

  // ── System Design ────────────────────────────────────────────────────────────
  {
    type: 'system-design', difficulty: 'medium',
    question: 'Design a URL shortening service like bit.ly. Support 100M URLs, 1B redirects/day.',
    modelAnswer: 'Cover: hashing strategy (base62), collision handling, DB schema, CDN for redirect cache, analytics pipeline, rate limiting.',
    tags: ['scalability', 'hashing', 'caching'], companies: ['Google', 'Amazon', 'Meta'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'system-design', difficulty: 'hard',
    question: 'Design Twitter\'s home timeline feature at scale (400M DAU, 500M tweets/day).',
    modelAnswer: 'Cover fan-out-on-write vs fan-out-on-read, celebrity user handling, Redis cache, timeline generation service, eventual consistency trade-offs.',
    tags: ['feed', 'fan-out', 'caching', 'distributed'], companies: ['Twitter', 'Meta', 'Google'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'system-design', difficulty: 'hard',
    question: 'Design a distributed key-value store like DynamoDB or Cassandra.',
    modelAnswer: 'Cover: consistent hashing, replication factor, quorum reads/writes, vector clocks, gossip protocol, compaction.',
    tags: ['distributed-systems', 'consistency', 'replication'], companies: ['Amazon', 'Google', 'Meta'], roles: ['Software Engineer'],
  },
  {
    type: 'system-design', difficulty: 'medium',
    question: 'Design a rate limiter for an API gateway supporting 10K requests/second per user.',
    modelAnswer: 'Cover: fixed vs sliding window vs token bucket algorithms, Redis for distributed state, leaky bucket for smoothing bursts.',
    tags: ['rate-limiting', 'redis', 'api'], companies: ['Stripe', 'Cloudflare', 'Google'], roles: ['Software Engineer'],
  },
  {
    type: 'system-design', difficulty: 'hard',
    question: 'Design a real-time collaborative document editor like Google Docs.',
    modelAnswer: 'Cover: Operational Transformation or CRDT for conflict resolution, WebSocket for real-time sync, revision history, presence indicators.',
    tags: ['real-time', 'websocket', 'conflict-resolution'], companies: ['Google', 'Notion', 'Figma'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'system-design', difficulty: 'medium',
    question: 'Design a notification service that supports push, email, and SMS at scale.',
    modelAnswer: 'Cover: message queue (Kafka/SQS), provider abstraction layer, deduplication, retry with exponential backoff, user preferences, observability.',
    tags: ['messaging', 'queues', 'scalability'], companies: ['Amazon', 'Twilio', 'Meta'], roles: ['Software Engineer'],
  },
  {
    type: 'system-design', difficulty: 'hard',
    question: 'Design a ride-sharing service like Uber. Focus on matching and real-time location.',
    modelAnswer: 'Cover: geospatial indexing (quadtree/H3), driver matching algorithm, location streaming via WebSocket, surge pricing, payment service.',
    tags: ['geospatial', 'real-time', 'matching'], companies: ['Uber', 'Lyft', 'Google'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'system-design', difficulty: 'medium',
    question: 'Design a content delivery network (CDN) from scratch.',
    modelAnswer: 'Cover: edge node placement (anycast), cache invalidation strategies, origin shield, SSL termination, health checks, push vs pull model.',
    tags: ['cdn', 'caching', 'networking'], companies: ['Cloudflare', 'Amazon', 'Akamai'], roles: ['Software Engineer'],
  },
  {
    type: 'system-design', difficulty: 'medium',
    question: 'Design a search autocomplete system for a search engine (like Google suggest).',
    modelAnswer: 'Cover: trie data structure, top-k results, frequency tracking, distributed trie sharding, cache at CDN edge, debounce on client.',
    tags: ['trie', 'caching', 'search'], companies: ['Google', 'Amazon', 'Bing'], roles: ['Software Engineer'],
  },

  // ── HR / Culture Fit ─────────────────────────────────────────────────────────
  {
    type: 'hr', difficulty: 'easy',
    question: 'Why are you interested in this role and company specifically?',
    modelAnswer: 'Research the company\'s mission, recent launches, and culture. Connect your career goals authentically.',
    tags: ['motivation', 'culture', 'research'], companies: ['Google', 'Amazon', 'Meta', 'Microsoft'], roles: ['Software Engineer', 'Product Manager', 'Data Scientist'],
  },
  {
    type: 'hr', difficulty: 'easy',
    question: 'Where do you see yourself professionally in the next three to five years?',
    modelAnswer: 'Be specific about the kind of impact you want to have and skills to develop. Align with the growth path the role offers.',
    tags: ['career-goals', 'growth'], companies: ['Google', 'Amazon', 'Stripe'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'hr', difficulty: 'medium',
    question: 'How do you approach work-life balance, and how do you maintain it during high-pressure periods?',
    modelAnswer: 'Show self-awareness, sustainable habits, and a track record of recovery after crunch without burning out.',
    tags: ['work-life-balance', 'wellbeing', 'maturity'], companies: ['Google', 'Microsoft', 'Airbnb'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'hr', difficulty: 'easy',
    question: 'What are you looking for in your next role that you\'re not finding in your current position?',
    modelAnswer: 'Be honest but constructive. Focus on growth opportunities, scope, or mission rather than criticising your current employer.',
    tags: ['motivation', 'career-change', 'honesty'], companies: ['Google', 'Stripe', 'Airbnb'], roles: ['Software Engineer', 'Engineering Manager'],
  },
  {
    type: 'hr', difficulty: 'medium',
    question: 'Describe your ideal team culture and how you contribute to it.',
    modelAnswer: 'Be specific: psychological safety, constructive feedback loops, ownership. Give a concrete example of contributing to culture positively.',
    tags: ['culture', 'teamwork', 'values'], companies: ['Google', 'Meta', 'Stripe'], roles: ['Software Engineer', 'Engineering Manager'],
  },

  // ── Case Study ───────────────────────────────────────────────────────────────
  {
    type: 'case-study', difficulty: 'medium',
    question: 'Estimate the number of daily active users for a popular food delivery app in a major metropolitan city.',
    modelAnswer: 'Break into segments: city population → smartphone owners → food delivery app users (% of population) → DAU/MAU ratio → result.',
    tags: ['estimation', 'market-sizing', 'fermi'], companies: ['DoorDash', 'Uber', 'Amazon'], roles: ['Product Manager', 'Data Scientist'],
  },
  {
    type: 'case-study', difficulty: 'hard',
    question: 'A major e-commerce platform\'s conversion rate dropped 15% last Monday. How would you diagnose and fix it?',
    modelAnswer: 'Structure: confirm the metric (segment by device, region, product). Hypothesise causes (deploy, A/B test, external event). Use data to validate. Propose fix and rollback plan.',
    tags: ['product-analytics', 'debugging', 'metrics'], companies: ['Amazon', 'Shopify', 'Etsy'], roles: ['Product Manager', 'Data Scientist'],
  },
  {
    type: 'case-study', difficulty: 'medium',
    question: 'You\'ve been given a $500K marketing budget for a new B2B SaaS product. How would you allocate it?',
    modelAnswer: 'Cover: ICP definition, channel mix (content, paid, outbound, partnerships), attribution model, payback period, test-and-learn approach.',
    tags: ['marketing', 'budget', 'go-to-market'], companies: ['Stripe', 'Salesforce'], roles: ['Product Manager'],
  },
  {
    type: 'case-study', difficulty: 'hard',
    question: 'Design a metrics framework to measure the success of a new AI-powered onboarding feature.',
    modelAnswer: 'Cover: primary metric (time-to-value, activation rate), guardrail metrics (retention, support tickets), experimentation plan, long-term proxy metrics.',
    tags: ['metrics', 'product', 'experimentation'], companies: ['Meta', 'Google', 'Airbnb'], roles: ['Product Manager', 'Data Scientist'],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Add it to .env');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url,
    entities: [Question],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(Question);

  const existing = await repo.count();
  const force    = process.argv.includes('--force');

  if (existing > 0 && !force) {
    console.log(`Seed skipped: ${existing} questions already exist. Use --force to re-seed.`);
    await dataSource.destroy();
    return;
  }

  if (existing > 0 && force) {
    await repo.clear();
    console.log(`Cleared ${existing} existing questions.`);
  }

  await repo.insert(SEED as unknown as Question[]);
  console.log(`✓ Seeded ${SEED.length} questions across all interview types.`);
  await dataSource.destroy();
}

seed().catch((err: Error) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
