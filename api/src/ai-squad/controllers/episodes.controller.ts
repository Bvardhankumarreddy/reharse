import {
  Controller, Get, Post, Param, Query, Body, Req, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { Episode, EpisodeStatus } from '../entities/episode.entity';
import { DialogueSegment } from '../entities/dialogue-segment.entity';
import { LanguageVersion } from '../entities/language-version.entity';
import { DialogueGeneratorService } from '../services/dialogue-generator.service';
import { HeyGenSquadService } from '../services/heygen-squad.service';
import { ThumbnailPromptService } from '../services/thumbnail-prompt.service';
import { DistributionService } from '../services/distribution.service';
import { TranslationService } from '../services/translation.service';

@Controller('admin/ai-squad/episodes')
@UseGuards(AdminGuard)
export class EpisodesController {
  constructor(
    @InjectRepository(Episode) private readonly episodeRepo: Repository<Episode>,
    @InjectRepository(DialogueSegment) private readonly segmentRepo: Repository<DialogueSegment>,
    @InjectRepository(LanguageVersion) private readonly langRepo: Repository<LanguageVersion>,
    private readonly dialogue: DialogueGeneratorService,
    private readonly heygen: HeyGenSquadService,
    private readonly thumbnail: ThumbnailPromptService,
    private readonly distribution: DistributionService,
    private readonly translation: TranslationService,
  ) {}

  // ── Multi-language ──────────────────────────────────────────────────

  @Post(':id/translate')
  translate(@Param('id') id: string, @Body() body?: { languages?: string[] }) {
    return this.translation.translateEpisode(id, body?.languages ?? ['hindi', 'telugu']);
  }

  @Get(':id/languages')
  languages(@Param('id') id: string) {
    return this.langRepo.find({
      where: { episodeId: id },
      order: { isPrimary: 'DESC', languageCode: 'ASC' },
    });
  }

  @Get(':id/languages/:lang')
  languageDialogue(@Param('id') id: string, @Param('lang') lang: string) {
    return this.segmentRepo.find({
      where: { episodeId: id, languageCode: lang },
      order: { segmentOrder: 'ASC' },
    });
  }

  @Post(':id/languages/:lang/generate-videos')
  generateLangVideos(@Param('id') id: string, @Param('lang') lang: string) {
    return this.heygen.generateEpisodeVideos(id, lang);
  }

  @Post(':id/generate-all-languages')
  generateAllLanguages(@Param('id') id: string) {
    return this.heygen.generateAllLanguages(id);
  }

  @Post(':id/languages/:lang/published')
  async markLangPublished(
    @Param('id') id: string,
    @Param('lang') lang: string,
    @Body() body: { youtubeUrl?: string },
  ) {
    if (!body.youtubeUrl) throw new BadRequestException('youtubeUrl required');
    const lv = await this.langRepo.findOne({
      where: { episodeId: id, languageCode: lang },
    });
    if (!lv) throw new NotFoundException('Language version not found');
    await this.langRepo.update(lv.id, {
      status: 'published',
      publishedYoutubeUrl: body.youtubeUrl,
      publishedAt: new Date(),
    });
    if (lang === 'english') {
      await this.episodeRepo.update(id, {
        status: 'published',
        publishedYoutubeUrl: body.youtubeUrl,
      });
    }
    return { success: true };
  }

  @Get()
  async list(@Query('status') status?: EpisodeStatus) {
    const qb = this.episodeRepo
      .createQueryBuilder('ep')
      .leftJoinAndSelect('ep.topic', 'topic')
      .orderBy('ep."episodeNumber"', 'DESC')
      .limit(200);
    if (status) qb.where('ep.status = :status', { status });
    const data = await qb.getMany();
    return { data, count: data.length };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const ep = await this.episodeRepo.findOne({
      where: { id },
      relations: ['topic', 'segments', 'assets'],
    });
    if (!ep) throw new NotFoundException('Episode not found');
    ep.segments?.sort((a, b) => a.segmentOrder - b.segmentOrder);
    return ep;
  }

  /** Stage 3: generate dialogue for a topic → new episode. */
  @Post('generate-from-topic/:topicId')
  generateFromTopic(@Param('topicId') topicId: string) {
    return this.dialogue.generateEpisode(topicId);
  }

  /** Trigger HeyGen for every segment (dormant until creds set). */
  @Post(':id/generate-videos')
  async generateVideos(@Param('id') id: string) {
    const ep = await this.episodeRepo.findOne({ where: { id } });
    if (!ep) throw new NotFoundException('Episode not found');
    return this.heygen.generateEpisodeVideos(id);
  }

  @Post(':id/generate-thumbnails')
  async generateThumbnails(@Param('id') id: string) {
    const ep = await this.episodeRepo.findOne({
      where: { id },
      relations: ['topic'],
    });
    if (!ep) throw new NotFoundException('Episode not found');
    if (!ep.topic) throw new BadRequestException('Episode has no linked topic');

    const { variations, cost_usd } = await this.thumbnail.generate(ep, ep.topic);
    ep.thumbnailPrompts = variations as unknown[];
    await this.episodeRepo.save(ep);
    return { success: true, variations, costAdded: cost_usd };
  }

  @Post(':id/generate-distribution')
  async generateDistribution(@Param('id') id: string) {
    const ep = await this.episodeRepo.findOne({
      where: { id },
      relations: ['topic'],
    });
    if (!ep) throw new NotFoundException('Episode not found');
    if (!ep.topic) throw new BadRequestException('Episode has no linked topic');

    const { package: pkg, cost_usd } = await this.distribution.generateForEpisode(
      ep,
      ep.topic,
    );
    ep.distributionPackage = pkg;
    ep.distributionCostUsd = Number(ep.distributionCostUsd ?? 0) + cost_usd;
    await this.episodeRepo.save(ep);
    return { success: true, package: pkg, costAdded: cost_usd };
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: Request) {
    const ep = await this.episodeRepo.findOne({ where: { id } });
    if (!ep) throw new NotFoundException('Episode not found');
    const email =
      (req as Request & { user?: { email?: string } }).user?.email ?? 'admin';
    await this.episodeRepo.update(id, {
      status: 'approved',
      approvedBy: email,
      approvedAt: new Date(),
    });
    return { success: true };
  }

  @Post(':id/published')
  async published(
    @Param('id') id: string,
    @Body() body: { youtubeUrl?: string },
  ) {
    if (!body.youtubeUrl) throw new BadRequestException('youtubeUrl required');
    const ep = await this.episodeRepo.findOne({ where: { id } });
    if (!ep) throw new NotFoundException('Episode not found');
    await this.episodeRepo.update(id, {
      status: 'published',
      publishedYoutubeUrl: body.youtubeUrl,
    });
    return { success: true };
  }
}
