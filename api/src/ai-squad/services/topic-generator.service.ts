import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Theme } from '../entities/theme.entity';
import { Topic } from '../entities/topic.entity';
import { AnthropicClientService } from './anthropic-client.service';
import { CharacterKey, isCharacterKey } from '../config/cast.config';

const TOPIC_SYSTEM_PROMPT = `
You generate specific EPISODE TOPICS under a theme for AetherStackAI's
"The AI Squad" series (4 robot characters).

CHARACTERS (pick 2-4 per topic, use exact keys):
- "byte"          BYTE  — Engineer, technical explanations
- "kira_serious"  KIRA  — Explorer, thoughtful/deep questions
- "kira_fun"      KIRA  — Explorer, excited/playful reactions
- "atlas"         ATLAS — Skeptic, challenges & debates
- "luna"          LUNA  — Innovator, "what if" / future

PAIRING LOGIC:
- explainer → byte + kira_serious
- debate → byte + atlas (or all 4 for big debates)
- speculation → luna + kira_fun (or luna + atlas: dreamer vs realist)
- story → kira_fun + luna
- deep dive → all 4
You may include both kira_serious AND kira_fun if KIRA's emotional range matters.

TOPIC TYPES: explainer | debate | speculation | walkthrough | story
FORMATS: long (7-10 min, most) | short (30-60 sec, occasional)

DO: scroll-stopping accurate titles; pick characters that FIT; vary combos;
Indian-English angles. DON'T: generic titles; same pair every time; near-duplicate topics.

Respond with STRICT JSON ONLY:
{"topics":[{"title":"...","description":"<2 sentences>","angle":"<hook>","topic_type":"explainer|debate|speculation|walkthrough|story","recommended_characters":["byte","atlas"],"difficulty":"beginner|intermediate|advanced","estimated_duration_minutes":<1-10>,"format":"long|short","key_concepts":["c1","c2","c3"]}]}
`.trim();

interface TopicLlm {
  title: string;
  description?: string;
  angle?: string;
  topic_type?: string;
  recommended_characters?: string[];
  difficulty?: string;
  estimated_duration_minutes?: number;
  format?: string;
  key_concepts?: string[];
}

@Injectable()
export class TopicGeneratorService {
  private readonly logger = new Logger(TopicGeneratorService.name);

  constructor(
    @InjectRepository(Theme) private readonly themeRepo: Repository<Theme>,
    @InjectRepository(Topic) private readonly topicRepo: Repository<Topic>,
    private readonly claude: AnthropicClientService,
  ) {}

  async generateTopicsForTheme(
    themeId: string,
    count = 8,
  ): Promise<{ topics: Topic[]; cost: number }> {
    const theme = await this.themeRepo.findOne({ where: { id: themeId } });
    if (!theme) throw new NotFoundException('Theme not found');
    if (!this.claude.isConfigured()) {
      throw new Error('Anthropic not configured — cannot generate topics');
    }

    const { content, usage, model } = await this.claude.completeJSON({
      system: TOPIC_SYSTEM_PROMPT,
      user:
        `THEME: ${theme.title}\nDESCRIPTION: ${theme.description ?? ''}\n` +
        `CATEGORY: ${theme.category ?? 'general'}\nAUDIENCE: ${theme.targetAudience}\n\n` +
        `Generate ${count} specific episode topics under this theme. ` +
        `For each, pick the right 2-4 characters, topic type, and format.`,
      temperature: 0.85,
      maxTokens: 3000,
    });

    const parsed = JSON.parse(content || '{}') as { topics?: TopicLlm[] };
    const list = parsed.topics ?? [];
    const cost = this.claude.cost(model, usage);
    const perTopic = list.length ? cost / list.length : 0;

    const topics = await this.topicRepo.save(
      list.map((t) =>
        this.topicRepo.create({
          themeId,
          title: t.title,
          description: t.description ?? null,
          angle: t.angle ?? null,
          topicType: (t.topic_type as Topic['topicType']) ?? 'explainer',
          recommendedCharacters: (t.recommended_characters ?? []).filter(
            isCharacterKey,
          ) as CharacterKey[],
          difficulty: (t.difficulty as Topic['difficulty']) ?? 'beginner',
          estimatedDurationMinutes: t.estimated_duration_minutes ?? 8,
          format: (t.format as Topic['format']) ?? 'long',
          keyConcepts: t.key_concepts ?? [],
          status: 'planned',
          generationCostUsd: perTopic,
        }),
      ),
    );

    this.logger.log(
      `Generated ${topics.length} topics for theme ${themeId} (cost $${cost.toFixed(4)})`,
    );
    return { topics, cost };
  }
}
