import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NewsItem } from '../entities/news-item.entity';
import { NewsScore } from '../entities/news-score.entity';
import { ShortScript, AvatarKey } from '../entities/short-script.entity';
import { OpenAIClientService } from './openai-client.service';

const SCRIPT_SYSTEM_PROMPT = `
You write YouTube Shorts scripts for AetherStackAI — an Indian AI
education channel hosted by Vardhan.

BRAND VOICE:
- Conversational, like explaining to a friend
- Slightly mysterious / curious tone
- Indian English audience
- Use words like "Spoiler:", "Plot twist:", "Here's the thing"
- 30-45 seconds (75-110 words)

SCRIPT STRUCTURE:
1. HOOK (0-5 sec): Question, surprising fact, or bold statement
2. BODY (5-35 sec): The actual news + why it matters
3. CTA (35-45 sec): "Subscribe for more" or "Comment your thoughts"

PAUSE MARKERS:
Add [1 sec pause] after impact lines.
Add [2 sec pause] before reveals.

RULES:
- NO jargon without explanation
- NO clickbait that doesn't deliver
- NO opinions presented as facts
- ALWAYS connect to "what this means for you"

Respond with JSON ONLY:
{"hook": "<5s opening>", "body": "<25-30s main content with pause markers>", "cta": "<5-10s call to action>", "duration_estimate": <total seconds>, "brand_voice_score": <1-100>}
`.trim();

interface ScriptResponse {
  hook: string;
  body: string;
  cta: string;
  duration_estimate: number;
  brand_voice_score: number;
}

@Injectable()
export class ScriptGeneratorService {
  private readonly logger = new Logger(ScriptGeneratorService.name);

  constructor(
    @InjectRepository(NewsItem)
    private readonly itemRepo: Repository<NewsItem>,
    @InjectRepository(NewsScore)
    private readonly scoreRepo: Repository<NewsScore>,
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    private readonly openai: OpenAIClientService,
    private readonly config: ConfigService,
  ) {}

  async generateScript(itemId: string): Promise<ShortScript> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      relations: ['source'],
    });
    if (!item) throw new Error(`News item ${itemId} not found`);

    const score = await this.scoreRepo.findOne({ where: { newsItemId: itemId } });
    const model = this.config.get<string>('aiQuickBytes.openai.scriptModel') ?? 'gpt-4o';

    const completion = await this.openai.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
        { role: 'user', content: this.buildPrompt(item, score) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as ScriptResponse;
    const cost = this.calcCost(model, completion.usage);
    const avatarId = this.assignAvatar(item);
    const fullScript = `${parsed.hook}\n\n${parsed.body}\n\n${parsed.cta}`;

    const script = await this.scriptRepo.save(this.scriptRepo.create({
      newsItemId: itemId,
      hook: parsed.hook,
      body: parsed.body,
      cta: parsed.cta,
      fullScript,
      durationEstimateSeconds: parsed.duration_estimate ?? null,
      avatarId,
      voiceId: this.config.get<string>('aiQuickBytes.heygen.voiceClone.vardhan') ?? null,
      brandVoiceScore: parsed.brand_voice_score ?? null,
      status: 'draft',
      costUsd: cost,
    }));

    await this.itemRepo.update(itemId, { status: 'scripted' });
    return script;
  }

  /** Generate scripts for the top-scored, not-yet-scripted stories. */
  async generateForTopStories(limit = 3): Promise<number> {
    if (!this.openai.isConfigured()) {
      this.logger.warn('OpenAI not configured — skipping script generation');
      return 0;
    }

    // Scripts must be about timely news — only consider stories published
    // within the freshness window (same knob as ingestion), then rank by
    // score, breaking ties toward the more recent story.
    const maxAgeHours =
      this.config.get<number>('aiQuickBytes.limits.freshnessHours') ?? 48;
    const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);

    const top = await this.itemRepo
      .createQueryBuilder('item')
      .innerJoin(NewsScore, 'score', 'score."newsItemId" = item.id')
      .where('item.status = :status', { status: 'scored' })
      .andWhere(
        '(item."publishedAt" >= :cutoff OR item."publishedAt" IS NULL)',
        { cutoff },
      )
      .orderBy('score."compositeScore"', 'DESC')
      .addOrderBy('item."publishedAt"', 'DESC', 'NULLS LAST')
      .limit(limit)
      .getMany();

    let generated = 0;
    for (const item of top) {
      try {
        await this.generateScript(item.id);
        generated++;
      } catch (e) {
        this.logger.error(`Script gen failed for ${item.id}: ${(e as Error).message}`);
      }
    }
    return generated;
  }

  private assignAvatar(item: NewsItem): AvatarKey {
    const sourceName = item.source?.name ?? '';
    const isNews = ['OpenAI', 'Google', 'Anthropic', 'TechCrunch', 'VentureBeat'].some(
      (n) => sourceName.includes(n),
    );
    const t = item.title.toLowerCase();
    const isFact = sourceName.includes('ArXiv') || t.includes('fact') || t.includes('history');

    if (isNews) return 'cyber';
    if (isFact) return 'robot';
    return 'vardhan';
  }

  private buildPrompt(item: NewsItem, score: NewsScore | null): string {
    const body = item.summary || item.content?.slice(0, 2000) || 'No summary';
    return `NEWS TO ADAPT:
Title: ${item.title}
Source: ${item.source?.name ?? 'unknown'}
Summary: ${body}
Score: ${score?.compositeScore ?? 'n/a'}/100

Create a 30-45 second YouTube Short script in the AetherStackAI brand voice.`;
  }

  private calcCost(model: string, usage?: { prompt_tokens?: number; completion_tokens?: number }): number {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const rates: Record<string, [number, number]> = {
      'gpt-4o': [2.5, 10],
      'gpt-4o-mini': [0.15, 0.6],
    };
    const [inRate, outRate] = rates[model] ?? rates['gpt-4o'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}
