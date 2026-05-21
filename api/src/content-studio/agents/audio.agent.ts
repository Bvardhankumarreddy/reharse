import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { StorageService } from '../../storage/storage.service';
import {
  TtsProvider, OpenAITtsProvider, ElevenLabsTtsProvider,
} from '../services/tts.provider';

/**
 * Turns a lesson's latest script into a narrated MP3. Provider-agnostic:
 * defaults to OpenAI TTS, ElevenLabs is a drop-in (per-brand override via
 * brand.modelOverrides.tts). Chunks long scripts under the provider's input
 * ceiling, concatenates the MP3 parts, uploads to S3 via StorageService, and
 * persists a versioned ContentAsset (assetType 'audio') holding the S3 key.
 */
@Injectable()
export class AudioAgent {
  private readonly logger = new Logger(AudioAgent.name);
  private readonly defaultProvider: string;

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly storage: StorageService,
    private readonly openaiTts: OpenAITtsProvider,
    private readonly elevenLabsTts: ElevenLabsTtsProvider,
    private readonly config: ConfigService,
  ) {
    this.defaultProvider = this.config.get<string>('contentStudio.tts.provider') ?? 'openai';
  }

  /** Whether at least one TTS provider + S3 storage is usable. */
  isConfigured(): boolean {
    return this.storage.isConfigured() &&
      (this.openaiTts.isConfigured() || this.elevenLabsTts.isConfigured());
  }

  private pickProvider(brandOverride?: string): TtsProvider {
    const want = (brandOverride ?? this.defaultProvider).toLowerCase();
    if (want === 'elevenlabs' && this.elevenLabsTts.isConfigured()) {
      return this.elevenLabsTts;
    }
    if (want === 'elevenlabs' && !this.elevenLabsTts.isConfigured()) {
      this.logger.warn('ElevenLabs requested but not configured — falling back to OpenAI');
    }
    return this.openaiTts;
  }

  async generateAudio(lessonId: string): Promise<ContentAsset> {
    if (!this.storage.isConfigured()) {
      throw new BadRequestException(
        'Storage (STORAGE_LAMBDA_URL/_SECRET) not configured — cannot store audio',
      );
    }
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const scriptAsset = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const scriptText = (
      scriptAsset?.content as { fullScript?: string } | null | undefined
    )?.fullScript?.trim();
    if (!scriptText) {
      throw new BadRequestException('No script yet — generate the script first.');
    }

    const provider = this.pickProvider(brand.modelOverrides?.tts);
    if (!provider.isConfigured()) {
      throw new BadRequestException(`TTS provider "${provider.name}" not configured`);
    }

    // Strip pause/scene markers so they aren't read aloud.
    const clean = scriptText
      .replace(/\[PAUSE[^\]]*\]/gi, ' ')
      .replace(/^[A-Z][A-Z \-—]{2,}$/gm, ' ')   // bare CAPS section headers
      .replace(/^ON-SCREEN:.*$/gim, ' ')        // live-coding/walkthrough cues
      .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
      .replace(/[ \t]+/g, ' ')
      .trim();

    const chunks = chunkText(clean, provider.maxChars);
    this.logger.log(
      `Audio for "${lesson.title}" — ${clean.length} chars in ${chunks.length} chunk(s) ` +
      `via ${provider.name}`,
    );

    const parts: Buffer[] = [];
    let costUsd = 0;
    let model = '';
    for (const c of chunks) {
      const r = await provider.synthesize(c);
      parts.push(r.audio);
      costUsd += r.costUsd;
      model = r.model;
    }
    const audio = Buffer.concat(parts);
    const ext = 'mp3';

    const slug = (lesson.title || `lesson-${lesson.lessonNumber}`)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    const key = `content-studio/audio/${plan.id}/${lesson.id}-${Date.now()}-${slug}.${ext}`;
    const storageKey = await this.storage.upload(key, audio, 'audio/mpeg');

    // ~150 wpm narration estimate for display.
    const words = clean.split(/\s+/).filter(Boolean).length;
    const durationSec = Math.round((words / 150) * 60);

    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'audio' },
      order: { version: 'DESC' },
    });
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: plan.id,
        lessonId: lesson.id,
        assetType: 'audio',
        version: (latest?.version ?? 0) + 1,
        storageKey,
        content: {
          provider: provider.name,
          model,
          voice: brand.modelOverrides?.ttsVoice ?? null,
          chars: clean.length,
          bytes: audio.length,
          chunks: chunks.length,
          durationEstimateSeconds: durationSec,
          costUsd,
        },
        status: 'draft',
      }),
    );

    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + costUsd,
    });
    this.logger.log(
      `Audio v${asset.version} for "${lesson.title}" — ${(audio.length / 1024).toFixed(0)} KB, ` +
      `~${Math.round(durationSec / 60)} min ($${costUsd.toFixed(4)}, ${provider.name})`,
    );
    return asset;
  }

  async latestAudio(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'audio' },
      order: { version: 'DESC' },
    });
  }

  /** Presigned GET URL for the latest audio (15 min TTL). */
  async latestAudioUrl(lessonId: string): Promise<{ asset: ContentAsset; url: string } | null> {
    const asset = await this.latestAudio(lessonId);
    if (!asset?.storageKey) return null;
    const url = await this.storage.getPresignedUrl(asset.storageKey);
    return { asset, url };
  }
}

/**
 * Split text into <=maxChars chunks, preferring paragraph then sentence
 * boundaries so the synth doesn't cut mid-word.
 */
function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  // Split into sentences (rough), then greedily pack.
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text];
  let buf = '';
  for (const s of sentences) {
    if (s.length > maxChars) {
      // A single huge sentence — hard-split it.
      if (buf) { chunks.push(buf.trim()); buf = ''; }
      for (let i = 0; i < s.length; i += maxChars) {
        chunks.push(s.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if ((buf + s).length > maxChars) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}
