import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Topic } from '../entities/topic.entity';
import { Episode } from '../entities/episode.entity';
import { DialogueSegment } from '../entities/dialogue-segment.entity';
import { AnthropicClientService } from './anthropic-client.service';
import { TranslationService } from './translation.service';
import { CharacterKey, SPEAKER_NAME, isCharacterKey } from '../config/cast.config';

const DIALOGUE_SYSTEM_PROMPT = `
You write DRAMATIC + REAL-WORLD dialogue for "The AI Squad" — an AetherStackAI
YouTube series with 4 robot characters. Style: Netflix drama meets TED-Ed —
high stakes, real examples (real people/companies/money), emotional beats,
cinematic pauses, natural friction between characters, plot twists, always
educational underneath.

CHARACTERS (use exact keys; 2-4 per episode):
- "byte"          BYTE  — calm, technical, reveals truths
- "kira_serious"  KIRA  — curious, measured, deep questions, audience surrogate
- "kira_fun"      KIRA  — excited, "wait wait wait!", emotional reactions
- "atlas"         ATLAS — sharp skeptic, "but actually...", reality check
- "luna"          LUNA  — dreamy innovator, "what if...", future-forward
Switch KIRA: reacting/excited → kira_fun; asking/thoughtful → kira_serious.

LONG (7-10 min): ACT1 hook w/ real stakes → ACT2 exploration → ACT3 reveal/
twist → ACT4 wrap-up + subscribe CTA. SHORT (30-60s): 5-8 segments only.

REQUIRED: real names/numbers/dates; stakes language; characters disagree then
converge; [1 sec pause] after impact, [2 sec pause] before reveals, [1.5 sec
pause] for emotional beats. Each segment 10-45s. NO generic "yes that's right"
filler, NO made-up stats, NO lectures.

Respond with STRICT JSON ONLY:
{"episode_title":"<dramatic clickable>","characters_used":["byte","atlas"],"total_duration_seconds":<int>,"total_segments":<int>,"dialogue":[{"character_key":"atlas","emotion":"skeptical","text":"...","text_with_pauses":"... [1 sec pause] ...","duration_estimate":<decimal sec>}]}
`.trim();

interface DialogueLlmSeg {
  character_key: string;
  emotion?: string;
  text: string;
  text_with_pauses?: string;
  duration_estimate?: number;
}
interface DialogueLlm {
  episode_title?: string;
  characters_used?: string[];
  total_duration_seconds?: number;
  dialogue?: DialogueLlmSeg[];
}

@Injectable()
export class DialogueGeneratorService {
  private readonly logger = new Logger(DialogueGeneratorService.name);

  constructor(
    @InjectRepository(Topic) private readonly topicRepo: Repository<Topic>,
    @InjectRepository(Episode) private readonly episodeRepo: Repository<Episode>,
    @InjectRepository(DialogueSegment) private readonly segmentRepo: Repository<DialogueSegment>,
    private readonly claude: AnthropicClientService,
    private readonly translation: TranslationService,
  ) {}

  /**
   * @param opts.characters — explicit cast chosen in the admin UI. When given,
   * it LOCKS the cast: Claude is told to use exactly these and no others.
   * Empty/absent → fall back to the topic's recommended cast (Claude may adjust).
   */
  async generateEpisode(
    topicId: string,
    opts: { characters?: CharacterKey[] } = {},
  ): Promise<Episode> {
    const topic = await this.topicRepo.findOne({
      where: { id: topicId },
      relations: ['theme'],
    });
    if (!topic) throw new NotFoundException('Topic not found');
    if (!this.claude.isConfigured()) {
      throw new Error('Anthropic not configured — cannot generate dialogue');
    }

    const lockedCast = Array.from(
      new Set((opts.characters ?? []).filter(isCharacterKey)),
    ) as CharacterKey[];
    if (lockedCast.length === 1) {
      throw new Error('Pick at least 2 characters for a dialogue');
    }
    const cast = lockedCast.length > 0 ? lockedCast : topic.recommendedCharacters;

    const episodeNumber = await this.getNextEpisodeNumber();
    const episode = await this.episodeRepo.save(
      this.episodeRepo.create({
        topicId,
        episodeNumber,
        title: topic.title,
        status: 'planning',
        charactersUsed: cast,
        characterCount: cast.length || 2,
        format: topic.format,
      }),
    );

    const targetDuration =
      topic.format === 'short' ? '30-60 seconds' : '7-10 minutes';
    const { content, usage, model } = await this.claude.completeJSON({
      system: DIALOGUE_SYSTEM_PROMPT,
      user:
        `GENERATE EPISODE ${episodeNumber} — "THE AI SQUAD"\n\n` +
        `Title: ${topic.title}\nDescription: ${topic.description ?? ''}\n` +
        `Angle: ${topic.angle ?? ''}\nType: ${topic.topicType}\n` +
        `Format: ${topic.format} (${targetDuration})\n` +
        `Key concepts: ${JSON.stringify(topic.keyConcepts)}\n` +
        (lockedCast.length > 0
          ? `CAST — USE EXACTLY THESE ${lockedCast.length} CHARACTERS, no others, ` +
            `and every one must speak: ${lockedCast.join(', ')}\n\n` +
            `Style: DRAMATIC + REAL-WORLD. Do NOT add or drop characters. ` +
            `Output strict JSON per the system prompt.`
          : `Recommended characters: ${cast.join(', ') || '(you choose 2-4)'}\n\n` +
            `Style: DRAMATIC + REAL-WORLD. You may adjust the character set if ` +
            `it improves the dialogue. Output strict JSON per the system prompt.`),
      temperature: 0.85,
      maxTokens: topic.format === 'short' ? 2000 : 6000,
    });

    const parsed = JSON.parse(content || '{}') as DialogueLlm;
    const rawDialogue = (parsed.dialogue ?? []).filter((d) =>
      isCharacterKey(d.character_key),
    );
    const cost = this.claude.cost(model, usage);

    const segments = await this.segmentRepo.save(
      rawDialogue.map((d, i) =>
        this.segmentRepo.create({
          episodeId: episode.id,
          segmentOrder: i + 1,
          characterKey: d.character_key as CharacterKey,
          speakerName: SPEAKER_NAME[d.character_key as CharacterKey],
          text: d.text,
          textWithPauses: d.text_with_pauses ?? d.text,
          emotionTag: d.emotion ?? null,
          durationEstimateSeconds: d.duration_estimate ?? null,
          languageCode: 'english',
          heygenStatus: 'pending',
        }),
      ),
    );

    const charsUsed = Array.from(
      new Set(rawDialogue.map((d) => d.character_key as CharacterKey)),
    );
    if (lockedCast.length > 0) {
      const off = [
        ...charsUsed.filter((c) => !lockedCast.includes(c)),
        ...lockedCast.filter((c) => !charsUsed.includes(c)),
      ];
      if (off.length > 0) {
        this.logger.warn(
          `Episode ${episodeNumber}: locked cast [${lockedCast.join(', ')}] ` +
          `but Claude produced [${charsUsed.join(', ')}]`,
        );
      }
    }
    const fullText = rawDialogue
      .map(
        (d) =>
          `[${SPEAKER_NAME[d.character_key as CharacterKey]}` +
          `${d.character_key === 'kira_fun' ? ' (excited)' : d.character_key === 'kira_serious' ? ' (thoughtful)' : ''}]: ` +
          `${d.text_with_pauses ?? d.text}`,
      )
      .join('\n\n');

    await this.episodeRepo.update(episode.id, {
      title: parsed.episode_title || topic.title,
      fullDialogueText: fullText,
      durationEstimateSeconds: parsed.total_duration_seconds ?? null,
      totalSegments: segments.length,
      charactersUsed: charsUsed,
      characterCount: charsUsed.length,
      llmCostUsd: cost,
      status: 'dialogue_generated',
    });
    await this.topicRepo.update(topicId, { status: 'in_production' });

    const saved = await this.episodeRepo.findOne({
      where: { id: episode.id },
      relations: ['segments', 'topic'],
    });
    if (!saved) throw new Error('Episode vanished after save');

    // Primary (English) language version — exists from the start so the
    // per-language readiness/publish flow works before any translation.
    await this.translation.ensureEnglishVersion(saved);
    this.logger.log(
      `Episode ${episodeNumber} "${saved.title}" — ${segments.length} segments, ` +
      `${charsUsed.length} chars (cost $${cost.toFixed(4)})`,
    );
    return saved;
  }

  private async getNextEpisodeNumber(): Promise<number> {
    const row = await this.episodeRepo
      .createQueryBuilder('ep')
      .select('MAX(ep."episodeNumber")', 'max')
      .getRawOne<{ max: number | null }>();
    return (Number(row?.max) || 0) + 1;
  }
}
