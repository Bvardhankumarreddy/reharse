import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ShortScript } from '../entities/short-script.entity';
import { PublishingLog, PublishPlatform } from '../entities/publishing-log.entity';
import { NewsScore } from '../entities/news-score.entity';

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    @InjectRepository(PublishingLog)
    private readonly logRepo: Repository<PublishingLog>,
    @InjectRepository(NewsScore)
    private readonly scoreRepo: Repository<NewsScore>,
  ) {}

  /**
   * MVP: record a manual publish. No auto-upload to YouTube (spec rule).
   *
   * For English YouTube publishes (default): sets script.status='published'
   * and script.youtubeUrl. This is the primary track that flips overall
   * status.
   *
   * For Telugu YouTube publishes (language='te'): sets only the Telugu
   * columns (teluguYoutubeUrl + extracted teluguYoutubeVideoId). Overall
   * script.status is NOT touched — English remains the primary publish
   * gate. A log entry is still written so daily-stats counts it.
   */
  async markAsPublished(
    scriptId: string,
    platform: PublishPlatform,
    url: string,
    language: 'en' | 'te' = 'en',
  ): Promise<PublishingLog> {
    const script = await this.scriptRepo.findOne({ where: { id: scriptId } });
    if (!script) throw new Error(`Script ${scriptId} not found`);

    const log = await this.logRepo.save(this.logRepo.create({
      scriptId,
      platform,
      status: 'success',
      externalUrl: url,
      publishedAt: new Date(),
    }));

    if (platform === 'youtube' && language === 'te') {
      // Extract video id from the YouTube URL (watch/shorts/youtu.be).
      const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
      await this.scriptRepo.update(scriptId, {
        teluguYoutubeUrl: url,
        teluguYoutubeVideoId: m ? m[1] : null,
      });
      this.logger.log(`Marked ${scriptId} (telugu) published on youtube: ${url}`);
    } else if (platform === 'youtube') {
      await this.scriptRepo.update(scriptId, {
        status: 'published',
        youtubeUrl: url,
      });
      this.logger.log(`Marked ${scriptId} published on ${platform}: ${url}`);
    } else {
      this.logger.log(`Marked ${scriptId} published on ${platform}: ${url}`);
    }
    return log;
  }

  async getDailyStats(): Promise<{ publishedToday: number; llmCostToday: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const publishedToday = await this.logRepo.count({
      where: { status: 'success', publishedAt: MoreThan(today) },
    });

    const scriptCost = await this.scriptRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s."costUsd"), 0)', 'total')
      .where('s."createdAt" > :today', { today })
      .getRawOne<{ total: string }>();

    const scoreCost = await this.scoreRepo
      .createQueryBuilder('sc')
      .select('COALESCE(SUM(sc."costUsd"), 0)', 'total')
      .where('sc."scoredAt" > :today', { today })
      .getRawOne<{ total: string }>();

    const llmCostToday =
      parseFloat(scriptCost?.total ?? '0') + parseFloat(scoreCost?.total ?? '0');

    return { publishedToday, llmCostToday: Number(llmCostToday.toFixed(6)) };
  }
}
