import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseScript, AiPulseThumbnailPrompt } from '../entities/news-script.entity';
import { AiPulseNewsItem, AiPulseVertical } from '../entities/news-item.entity';

const VERTICAL_STYLE: Record<AiPulseVertical, string> = {
  ai_business:   'professional, dark navy + saffron / orange accents, money + growth icons',
  tech_industry: 'editorial, dark navy + cyan glow, office + laptop + chart icons',
  ai_science:    'wonder-inspiring, dark navy + cosmic blue, ISRO / lab imagery',
  ai_education:  'aspirational, navy + green academic accents, classroom + book imagery',
  ai_society:    'thoughtful, navy + warning amber, balance / ethics imagery',
};

const SYSTEM = `
You design 3 YouTube Shorts thumbnail prompts for AetherStackAI.
Output JSON ONLY — strict format below.

EACH thumbnail must:
- Have a punchy ALL-CAPS HEADLINE overlay (≤6 words, English).
- Be designed for vertical 9:16 (1080×1920) Shorts format.
- Include a SOURCE BADGE in the BOTTOM-RIGHT corner reading
  EXACTLY "via {SOURCE_NAME}" — non-negotiable.
- Be readable on mobile in 1 second.

Generate 3 distinct styles in this order:
  1. "shocked_reaction"  — face + bold overlay, eye-catching
  2. "bold_text"         — minimal background + huge typography
  3. "visual_metaphor"   — icon / illustration that conveys the story

Output STRICT JSON:
{
  "variations": [
    {"style":"shocked_reaction","headline":"...","prompt":"...","source_badge":"via {SOURCE_NAME}"},
    {"style":"bold_text",       "headline":"...","prompt":"...","source_badge":"via {SOURCE_NAME}"},
    {"style":"visual_metaphor", "headline":"...","prompt":"...","source_badge":"via {SOURCE_NAME}"}
  ]
}
`.trim();

@Injectable()
export class AiPulseThumbnailService {
  private readonly logger = new Logger(AiPulseThumbnailService.name);
  private readonly openai: OpenAI | null;

  constructor(
    @InjectRepository(AiPulseScript)
    private readonly scripts: Repository<AiPulseScript>,
    @InjectRepository(AiPulseNewsItem)
    private readonly news: Repository<AiPulseNewsItem>,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generatePrompts(scriptId: string): Promise<AiPulseThumbnailPrompt[]> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');
    const script = await this.scripts.findOne({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('script not found');
    const item = await this.news.findOne({ where: { id: script.news_item_id } });
    if (!item) throw new NotFoundException('news item not found');

    const styleHint = VERTICAL_STYLE[script.vertical] ?? VERTICAL_STYLE.tech_industry;

    const user =
      `VERTICAL: ${script.vertical}\n` +
      `STYLE HINT: ${styleHint}\n` +
      `SOURCE NAME (use VERBATIM in source_badge — replace the {SOURCE_NAME} placeholder): ${item.source_name}\n\n` +
      `SCRIPT HOOK: ${script.english_hook ?? ''}\n` +
      `SCRIPT TITLE: ${script.english_title ?? ''}\n\n` +
      `Generate 3 thumbnail prompts. Every source_badge field MUST read EXACTLY:\n` +
      `  via ${item.source_name}\n`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1200,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as {
      variations?: AiPulseThumbnailPrompt[];
    };
    const variations = Array.isArray(parsed.variations) ? parsed.variations : [];
    // Hard guarantee: the source badge is always correct, regardless of
    // what the LLM emitted.
    const final = variations.slice(0, 3).map((v) => ({
      ...v,
      source_badge: `via ${item.source_name}`,
    }));
    await this.scripts.update(scriptId, { thumbnail_prompts: final });
    this.logger.log(`Thumbnail prompts ×${final.length} for script ${scriptId}`);
    return final;
  }
}
