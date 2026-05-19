import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Theme } from '../entities/theme.entity';
import { AnthropicClientService } from './anthropic-client.service';

const THEME_SYSTEM_PROMPT = `
You generate BROAD content themes for AetherStackAI — a YouTube AI education
channel by Vardhan. Themes feed into specific episode topics later.

THEME CATEGORIES (mix all 5):
1. fundamentals — "What is X?", beginner concepts
2. ethics — impact, controversy, philosophy
3. tools — real-world usage, productivity
4. future — "what if" scenarios, predictions
5. debate — two-sided takes, skepticism

DO: each theme = umbrella for 5-10 topics; scroll-stopping titles; mix
serious + playful; Indian-audience friendly; beginner→intermediate.
DON'T: themes too narrow (those are topics); generic boring titles; jargon.

Respond with STRICT JSON ONLY:
{"themes":[{"title":"...","description":"<2-sentence pitch>","category":"fundamentals|ethics|tools|future|debate","target_audience":"general|beginners|intermediate|advanced","estimated_topics_count":<5-10>}]}
`.trim();

interface ThemeLlm {
  title: string;
  description?: string;
  category?: string;
  target_audience?: string;
  estimated_topics_count?: number;
}

@Injectable()
export class ThemeGeneratorService {
  private readonly logger = new Logger(ThemeGeneratorService.name);

  constructor(
    @InjectRepository(Theme) private readonly themeRepo: Repository<Theme>,
    private readonly claude: AnthropicClientService,
  ) {}

  async generateThemes(count = 8): Promise<{ themes: Theme[]; cost: number }> {
    if (!this.claude.isConfigured()) {
      throw new Error('Anthropic not configured — cannot generate themes');
    }

    const { content, usage, model } = await this.claude.completeJSON({
      system: THEME_SYSTEM_PROMPT,
      user:
        `Generate ${count} fresh AI content themes for AetherStackAI. ` +
        `Mix fundamentals, ethics, tools, future and debate. Each theme should ` +
        `fuel 5-10 episode topics.`,
      temperature: 0.9,
      maxTokens: 2000,
    });

    const parsed = JSON.parse(content || '{}') as { themes?: ThemeLlm[] };
    const list = parsed.themes ?? [];
    const cost = this.claude.cost(model, usage);
    const perTheme = list.length ? cost / list.length : 0;

    const themes = await this.themeRepo.save(
      list.map((t) =>
        this.themeRepo.create({
          title: t.title,
          description: t.description ?? null,
          category: (t.category as Theme['category']) ?? null,
          targetAudience: t.target_audience ?? 'general',
          estimatedTopicsCount: t.estimated_topics_count ?? 8,
          generationCostUsd: perTheme,
          status: 'active',
        }),
      ),
    );

    this.logger.log(`Generated ${themes.length} themes (cost $${cost.toFixed(4)})`);
    return { themes, cost };
  }
}
