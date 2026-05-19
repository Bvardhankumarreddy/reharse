import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Episode } from '../entities/episode.entity';
import { DialogueSegment } from '../entities/dialogue-segment.entity';
import { LanguageVersion } from '../entities/language-version.entity';
import { AnthropicClientService } from './anthropic-client.service';
import { LanguageCode, isLanguageCode } from '../config/languages.config';

const TRANSLATION_SYSTEM_PROMPT = `
You translate "The AI Squad" dialogue from English to Hindi or Telugu while
preserving everything that makes it work as a dramatic video script.

PRESERVE:
- Each character's tone (BYTE calm/technical, KIRA-serious thoughtful,
  KIRA-fun energetic, ATLAS sharp/skeptical, LUNA dreamy).
- Drama + stakes language, emotional reactions.
- Real names verbatim (Steven Schwartz stays). Numbers stay numeric ($5000).
- Pause markers EXACTLY: [1 sec pause] [1.5 sec pause] [2 sec pause], in the
  same positions as the English.
- Keep tech terms in English: ChatGPT, GPT-4, Claude, OpenAI, AI, ML, API.

STYLE:
- Hindi → Devanagari, conversational (not news-formal), natural English
  code-mixing where a real speaker would.
- Telugu → Telugu script, educated Hyderabad speaker, same code-mixing.
- Idiomatic, not word-for-word.

Return STRICT JSON ONLY. For every input segment return one object with the
SAME segment_order:
{"language":"hindi|telugu","translated_segments":[{"segment_order":<int>,"text":"<no pause markers>","text_with_pauses":"<with the same markers>","duration_estimate":<decimal sec>}]}
`.trim();

interface TranslatedSeg {
  segment_order?: number;
  text?: string;
  text_with_pauses?: string;
  duration_estimate?: number;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    @InjectRepository(Episode) private readonly episodeRepo: Repository<Episode>,
    @InjectRepository(DialogueSegment) private readonly segmentRepo: Repository<DialogueSegment>,
    @InjectRepository(LanguageVersion) private readonly langRepo: Repository<LanguageVersion>,
    private readonly claude: AnthropicClientService,
  ) {}

  /** Ensure the primary English LanguageVersion row exists for an episode. */
  async ensureEnglishVersion(episode: Episode): Promise<LanguageVersion> {
    const existing = await this.langRepo.findOne({
      where: { episodeId: episode.id, languageCode: 'english' },
    });
    if (existing) return existing;
    return this.langRepo.save(
      this.langRepo.create({
        episodeId: episode.id,
        languageCode: 'english',
        isPrimary: true,
        translatedFullText: episode.fullDialogueText,
        status: 'translated',
      }),
    );
  }

  async translateEpisode(
    episodeId: string,
    targetLanguages: string[] = ['hindi', 'telugu'],
  ): Promise<{ versions: LanguageVersion[]; totalCost: number }> {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('Episode not found');
    if (!this.claude.isConfigured()) {
      throw new Error('Anthropic not configured — cannot translate');
    }

    const langs = targetLanguages.filter(
      (l): l is LanguageCode => isLanguageCode(l) && l !== 'english',
    );
    if (langs.length === 0) {
      throw new Error('No valid target languages (hindi/telugu)');
    }

    const originals = await this.segmentRepo.find({
      where: { episodeId, languageCode: 'english' },
      order: { segmentOrder: 'ASC' },
    });
    if (originals.length === 0) {
      throw new Error('No English segments to translate — generate the episode first');
    }
    const originalByOrder = new Map(originals.map((s) => [s.segmentOrder, s]));

    const englishVersion = await this.ensureEnglishVersion(episode);
    const versions: LanguageVersion[] = [englishVersion];
    let totalCost = 0;

    for (const lang of langs) {
      try {
        const { version, cost } = await this.translateTo(
          episode,
          originals,
          originalByOrder,
          lang,
        );
        versions.push(version);
        totalCost += cost;
      } catch (e) {
        this.logger.error(`Translate → ${lang} failed: ${(e as Error).message}`);
        await this.langRepo.update(
          { episodeId, languageCode: lang },
          { status: 'failed' },
        );
      }
    }

    await this.episodeRepo.update(episodeId, {
      languages: ['english', ...langs],
      translationCostUsd: Number(episode.translationCostUsd ?? 0) + totalCost,
    });
    return { versions, totalCost };
  }

  private async translateTo(
    episode: Episode,
    originals: DialogueSegment[],
    originalByOrder: Map<number, DialogueSegment>,
    lang: LanguageCode,
  ): Promise<{ version: LanguageVersion; cost: number }> {
    // upsert the language version row in 'translating'
    let version = await this.langRepo.findOne({
      where: { episodeId: episode.id, languageCode: lang },
    });
    version = version
      ? Object.assign(version, { status: 'translating' as const })
      : this.langRepo.create({
          episodeId: episode.id,
          languageCode: lang,
          isPrimary: false,
          status: 'translating',
        });
    version = await this.langRepo.save(version);

    // Replace any prior translated segments for this language (idempotent re-run)
    await this.segmentRepo.delete({ episodeId: episode.id, languageCode: lang });

    const langName =
      lang === 'hindi' ? 'Hindi (Devanagari)' : 'Telugu (Telugu script)';
    const user =
      `TRANSLATE TO ${langName.toUpperCase()}\n` +
      `Episode: ${episode.title}\nCharacters: ${episode.charactersUsed.join(', ')}\n\n` +
      originals
        .map(
          (s) =>
            `Segment ${s.segmentOrder} | ${s.speakerName} (${s.characterKey}) | ` +
            `emotion: ${s.emotionTag ?? '-'}\n${s.textWithPauses ?? s.text}`,
        )
        .join('\n\n') +
      `\n\nReturn one translated object per segment with the SAME segment_order.`;

    const { content, usage, model } = await this.claude.completeJSON({
      system: TRANSLATION_SYSTEM_PROMPT,
      user,
      temperature: 0.3,
      maxTokens: 6000,
    });
    const parsed = JSON.parse(content || '{}') as {
      translated_segments?: TranslatedSeg[];
    };
    const cost = this.claude.cost(model, usage);

    // Match by segment_order — never by array index.
    const rows: DialogueSegment[] = [];
    for (const t of parsed.translated_segments ?? []) {
      const orig = t.segment_order != null ? originalByOrder.get(t.segment_order) : undefined;
      if (!orig || !t.text) {
        this.logger.warn(
          `Skipping ${lang} translation for missing/unmatched segment_order ${t.segment_order}`,
        );
        continue;
      }
      rows.push(
        this.segmentRepo.create({
          episodeId: episode.id,
          segmentOrder: orig.segmentOrder,
          characterKey: orig.characterKey,
          speakerName: orig.speakerName,
          text: t.text,
          textWithPauses: t.text_with_pauses ?? t.text,
          emotionTag: orig.emotionTag,
          durationEstimateSeconds:
            t.duration_estimate ?? orig.durationEstimateSeconds,
          languageCode: lang,
          originalSegmentId: orig.id,
          heygenStatus: 'pending',
        }),
      );
    }
    await this.segmentRepo.save(rows);

    const fullText = rows
      .sort((a, b) => a.segmentOrder - b.segmentOrder)
      .map((r) => `[${r.speakerName}]: ${r.textWithPauses ?? r.text}`)
      .join('\n\n');

    await this.langRepo.update(version.id, {
      translatedDialogue: parsed.translated_segments ?? [],
      translatedFullText: fullText,
      translationCostUsd: cost,
      status: 'translated',
    });
    const saved = await this.langRepo.findOne({ where: { id: version.id } });
    if (!saved) throw new Error('LanguageVersion vanished after save');
    this.logger.log(
      `Translated episode ${episode.id} → ${lang}: ${rows.length}/${originals.length} segments (cost $${cost.toFixed(4)})`,
    );
    return { version: saved, cost };
  }
}
