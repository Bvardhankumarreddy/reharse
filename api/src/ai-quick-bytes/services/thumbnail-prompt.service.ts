import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicClientService } from './anthropic-client.service';
import { NewsItem } from '../entities/news-item.entity';
import { ShortScript } from '../entities/short-script.entity';
import { ThumbnailPromptResult } from '../dto/distribution-package.dto';

const THUMBNAIL_SYSTEM_PROMPT = `
You write image-generation prompts for AetherStackAI's "AI Quick Bytes"
YouTube Shorts thumbnails. The host (Vardhan) pastes your prompt into
ChatGPT/DALL-E to generate the actual image — so the prompt must be vivid,
specific, and self-contained.

BRAND VISUAL STYLE (must appear in every prompt):
- Dark navy background (#0A0E27) with subtle glowing tech particles
- Cyan (#00D4FF) + gold (#FFD700) neon accents
- Futuristic, high-contrast, game-show / tech energy
- Mobile-first 9:16 vertical Shorts thumbnail framing
- Space reserved for a big bold TEXT OVERLAY (3-5 words max)

AVATAR HINT:
- "cyber"  → sleek cyberpunk presenter / neon HUD elements
- "robot"  → friendly futuristic robot motif
- "vardhan"→ a confident young Indian male tech presenter

RULES:
- The image prompt must describe ONE striking focal subject tied to the
  Short's topic, not generic AI clip-art.
- High emotional contrast (surprise / curiosity), bold, scroll-stopping.
- Do NOT bake the overlay text into the image description — return it
  separately so it can be added cleanly.

Respond with STRICT JSON ONLY:
{
  "prompt": "<a single detailed image-generation prompt, 60-120 words, copy-paste ready>",
  "overlayText": "<3-5 word punchy overlay headline derived from the hook>"
}
`.trim();

@Injectable()
export class ThumbnailPromptService {
  private readonly logger = new Logger(ThumbnailPromptService.name);

  constructor(
    private readonly anthropic: AnthropicClientService,
    private readonly config: ConfigService,
  ) {}

  async generate(
    script: ShortScript,
    item: NewsItem,
  ): Promise<{ result: ThumbnailPromptResult; cost_usd: number }> {
    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system: THUMBNAIL_SYSTEM_PROMPT,
      user:
        `TOPIC: ${item.title}\n` +
        `AVATAR: ${script.avatarId ?? 'vardhan'}\n` +
        `HOOK: ${script.hook}\n` +
        `Generate the thumbnail image prompt + overlay text.`,
      temperature: 0.8,
      maxTokens: 800,
    });

    const parsed = JSON.parse(raw || '{}') as Partial<ThumbnailPromptResult>;
    const cost = this.calcCost(model, usage);

    return {
      result: {
        prompt: parsed.prompt?.trim() || '',
        overlayText: parsed.overlayText?.trim() || script.hook.slice(0, 60),
      },
      cost_usd: cost,
    };
  }

  private calcCost(
    model: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
  ): number {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const rates: Record<string, [number, number]> = {
      'claude-sonnet-4-6': [3, 15],
      'claude-opus-4-7': [15, 75],
      'claude-haiku-4-5-20251001': [1, 5],
      'gpt-4o': [2.5, 10],
      'gpt-4o-mini': [0.15, 0.6],
    };
    const [inRate, outRate] = rates[model] ?? rates['claude-sonnet-4-6'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}
