import { Injectable, Logger } from '@nestjs/common';
import { Episode } from '../entities/episode.entity';
import { Topic } from '../entities/topic.entity';
import { AnthropicClientService } from './anthropic-client.service';

export interface ThumbnailVariation {
  index: number;
  style: 'shocked_reaction' | 'conversation' | 'spotlight';
  headline: string;
  prompt: string;
  reasoning: string;
  estimatedCtrScore: number;
}

const THUMBNAIL_SYSTEM_PROMPT = `
You design YouTube thumbnail image-generation prompts for "The AI Squad"
(16:9, 1920x1080). The host pastes your prompt into ChatGPT/DALL-E.

CAST (depict the episode's characters; their visual identities are fixed):
- BYTE  — dark navy chrome robot, cyan glow, "B" chest panel
- KIRA  — white-pearl robot, gold heart panel "K", warm expression
- ATLAS — crimson-accented robot, sharp/skeptical stance
- LUNA  — purple-accented robot, dreamy/visionary pose
BRAND: dark navy #0A0E27, cyan #00D4FF, gold #FFD700, glowing particles.

Generate 3 variations:
1. shocked_reaction — characters reacting, big bold headline space
2. conversation — characters facing off, dialogue tension
3. spotlight — one character featured (fits the topic), others smaller

Each prompt 150-250 words, English only, copy-paste ready, leave space for
the overlay headline (don't bake text into the image description).

Respond with STRICT JSON ONLY:
{"variations":[{"index":0,"style":"shocked_reaction","headline":"<MAX 6 WORDS ALL CAPS>","prompt":"<full image prompt>","reasoning":"<why it works>","estimated_ctr_score":<1-100>}]}
`.trim();

interface VarLlm {
  index?: number;
  style?: string;
  headline?: string;
  prompt?: string;
  reasoning?: string;
  estimated_ctr_score?: number;
}

@Injectable()
export class ThumbnailPromptService {
  private readonly logger = new Logger(ThumbnailPromptService.name);

  constructor(private readonly claude: AnthropicClientService) {}

  async generate(
    episode: Episode,
    topic: Topic,
  ): Promise<{ variations: ThumbnailVariation[]; cost_usd: number }> {
    const { content, usage, model } = await this.claude.completeJSON({
      system: THUMBNAIL_SYSTEM_PROMPT,
      user:
        `EPISODE: ${episode.title}\nTOPIC: ${topic.title}\n` +
        `DESCRIPTION: ${topic.description ?? ''}\n` +
        `CHARACTERS: ${episode.charactersUsed.join(', ')}\n\n` +
        `Generate 3 thumbnail variations.`,
      temperature: 0.9,
      maxTokens: 2000,
    });

    const parsed = JSON.parse(content || '{}') as { variations?: VarLlm[] };
    const variations: ThumbnailVariation[] = (parsed.variations ?? []).map((v, i) => ({
      index: v.index ?? i,
      style: (v.style as ThumbnailVariation['style']) ?? 'conversation',
      headline: this.sanitize(v.headline ?? ''),
      prompt: this.sanitize(v.prompt ?? ''),
      reasoning: v.reasoning ?? '',
      estimatedCtrScore: v.estimated_ctr_score ?? 0,
    }));

    return { variations, cost_usd: this.claude.cost(model, usage) };
  }

  /** Strip stray non-Latin glyphs (occasional Claude artifact) from prompts. */
  private sanitize(s: string): string {
    if (!s) return s;
    return s
      .replace(/[^\t\n\r\x20-\x7E -ɏ‐-‧‰-⁞]/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
}
