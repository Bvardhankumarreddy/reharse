import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NewsItem } from '../entities/news-item.entity';
import { NewsScore } from '../entities/news-score.entity';
import { AqbMemoryService } from './aqb-memory.service';
import { OpenAIClientService } from './openai-client.service';

const SCORING_SYSTEM_PROMPT = `
You are a content curator for AetherStackAI, a YouTube channel teaching AI
to Indian audiences. Score each news story on 3 dimensions (1-100):

1. IMPORTANCE (50% weight): How significant is this for AI users?
   - 90-100: Major model releases, breakthroughs
   - 70-89: Important features, research findings
   - 50-69: Industry moves, smaller updates
   - <50: Minor news, hype, rumors

2. NOVELTY (30% weight): Is this genuinely new?
   - 90-100: Never reported before, exclusive
   - 70-89: Fresh angle on recent story
   - 50-69: Some new info on existing topic
   - <50: Rehashed news

3. VIRAL POTENTIAL (20% weight): Would Indian YouTube viewers engage?
   - 90-100: Hot take, controversy, "wow" factor
   - 70-89: Practical impact, useful
   - 50-69: Niche but interesting
   - <50: Too technical or boring

Reject stories that are:
- Marketing/PR fluff
- Funding announcements (unless >$1B)
- Personnel changes (unless major CEO moves)
- Opinion pieces without facts

Respond with JSON ONLY:
{"importance": <1-100>, "novelty": <1-100>, "viral_potential": <1-100>, "reasoning": "<2-sentence explanation>"}
`.trim();

interface ScoringResponse {
  importance: number;
  novelty: number;
  viral_potential: number;
  reasoning: string;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @InjectRepository(NewsItem)
    private readonly itemRepo: Repository<NewsItem>,
    @InjectRepository(NewsScore)
    private readonly scoreRepo: Repository<NewsScore>,
    private readonly openai: OpenAIClientService,
    private readonly config: ConfigService,
    private readonly memory: AqbMemoryService,
  ) {}

  async scoreItem(itemId: string): Promise<NewsScore> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      relations: ['source'],
    });
    if (!item) throw new Error(`News item ${itemId} not found`);

    const model = this.config.get<string>('aiQuickBytes.openai.scoringModel')
      ?? 'gpt-4o-mini';

    // Learning-loop block (empty until AqbMemory has scoring patterns).
    const memoryBlock = this.memory.format(await this.memory.relevantFor('scoring', 5));
    const userPrompt = memoryBlock
      ? `${this.buildPrompt(item)}\n\n${memoryBlock}`
      : this.buildPrompt(item);

    const completion = await this.openai.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SCORING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as ScoringResponse;
    const cost = this.calcCost(model, completion.usage);

    const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));

    const score = await this.scoreRepo.save(this.scoreRepo.create({
      newsItemId: itemId,
      importanceScore: clamp(parsed.importance),
      noveltyScore: clamp(parsed.novelty),
      viralPotential: clamp(parsed.viral_potential),
      reasoning: parsed.reasoning ?? null,
      modelUsed: model,
      costUsd: cost,
    }));

    await this.itemRepo.update(itemId, { status: 'scored' });
    return score;
  }

  async scoreUnscoredItems(limit = 50): Promise<number> {
    if (!this.openai.isConfigured()) {
      this.logger.warn('OpenAI not configured — skipping scoring run');
      return 0;
    }

    const items = await this.itemRepo.find({
      where: { status: 'raw' },
      take: limit,
      order: { publishedAt: 'DESC' },
    });

    let scored = 0;
    for (const item of items) {
      try {
        await this.scoreItem(item.id);
        scored++;
      } catch (e) {
        this.logger.error(`Failed to score ${item.id}: ${(e as Error).message}`);
      }
    }
    return scored;
  }

  private buildPrompt(item: NewsItem): string {
    const body = item.summary || item.content?.slice(0, 1000) || 'No summary';
    return `TITLE: ${item.title}
SOURCE: ${item.source?.name ?? 'unknown'}
PUBLISHED: ${item.publishedAt?.toISOString() ?? 'unknown'}
SUMMARY: ${body}
URL: ${item.url}

Score this AI news story for an Indian YouTube audience interested in practical AI education.`;
  }

  /** gpt-4o-mini: $0.15/1M in, $0.60/1M out. gpt-4o: $2.50/1M in, $10/1M out. */
  private calcCost(model: string, usage?: { prompt_tokens?: number; completion_tokens?: number }): number {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const rates: Record<string, [number, number]> = {
      'gpt-4o-mini': [0.15, 0.60],
      'gpt-4o': [2.5, 10],
    };
    const [inRate, outRate] = rates[model] ?? rates['gpt-4o-mini'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}
