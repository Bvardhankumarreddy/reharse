import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import {
  PublishedVideo, PublishStatus,
} from '../entities/published-video.entity';

/**
 * Phase D — generates the actual thumbnail PNG (not just the prompt). Reads
 * the latest cs_content_assets row of type 'thumbnail_prompt' for the
 * lesson, calls OpenAI Images API (DALL-E 3 default), persists the b64 PNG
 * on cs_published_videos.thumbnailB64 + remembers which prompt + model.
 *
 * Dormant if OPENAI_API_KEY missing — same isConfigured() pattern as the
 * other LLM clients.
 */
@Injectable()
export class ThumbnailImageAgent {
  private readonly logger = new Logger(ThumbnailImageAgent.name);
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly size: string;

  constructor(
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(PublishedVideo) private readonly publishedRepo: Repository<PublishedVideo>,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('contentStudio.openai.apiKey');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = this.config.get<string>('contentStudio.openai.imageModel') ?? 'dall-e-3';
    this.size = this.config.get<string>('contentStudio.openai.imageSize') ?? '1792x1024';
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — thumbnail image agent dormant');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async generateFor(lessonId: string): Promise<PublishedVideo> {
    if (!this.client) throw new BadRequestException('OPENAI_API_KEY not configured');
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const promptAsset = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'thumbnail_prompt' },
      order: { version: 'DESC' },
    });
    if (!promptAsset) {
      throw new BadRequestException(
        'No thumbnail prompt yet — generate the thumbnail prompt first.',
      );
    }
    const content = promptAsset.content as
      | { mainPrompt?: string; textOverlay?: string }
      | null;
    const basePrompt = content?.mainPrompt?.trim();
    if (!basePrompt) throw new BadRequestException('Thumbnail prompt is empty');

    // Append the text overlay instruction so the image carries the chosen copy.
    const fullPrompt = content?.textOverlay
      ? `${basePrompt}\n\nText overlay (rendered legibly, large): "${content.textOverlay}"`
      : basePrompt;

    const started = Date.now();
    const res = await this.client.images.generate({
      model: this.model,
      prompt: fullPrompt.slice(0, 3500),
      n: 1,
      size: this.size as '1024x1024' | '1024x1792' | '1792x1024',
      response_format: 'b64_json',
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error('Image API returned no b64_json');
    this.logger.log(
      `Thumbnail image for "${lesson.title}" — ${this.model} ${this.size}, ` +
      `${(b64.length / 1024).toFixed(0)} KB, ${Date.now() - started}ms`,
    );

    // Upsert cs_published_videos row.
    const existing = await this.publishedRepo.findOne({ where: { lessonId } });
    if (existing) {
      await this.publishedRepo.update(existing.id, {
        thumbnailB64: b64,
        thumbnailPrompt: fullPrompt.slice(0, 4000),
        thumbnailModel: this.model,
      });
      return (await this.publishedRepo.findOne({ where: { id: existing.id } }))!;
    }
    return this.publishedRepo.save(
      this.publishedRepo.create({
        lessonId,
        thumbnailB64: b64,
        thumbnailPrompt: fullPrompt.slice(0, 4000),
        thumbnailModel: this.model,
        status: 'pending' as PublishStatus,
      }),
    );
  }

  latestFor(lessonId: string): Promise<PublishedVideo | null> {
    return this.publishedRepo.findOne({ where: { lessonId } });
  }
}
