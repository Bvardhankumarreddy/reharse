import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { SocialPost } from './social-post.entity';
import { PostEngagement } from './post-engagement.entity';

const PUBLISHED = ['published_auto', 'published_manual'];

@Injectable()
export class ReportExportService {
  constructor(
    @InjectRepository(SocialPost) private readonly posts: Repository<SocialPost>,
    @InjectRepository(PostEngagement) private readonly engagement: Repository<PostEngagement>,
  ) {}

  /** CSV: one row per post with latest engagement snapshot */
  async exportPostsCSV(opts: { from?: string; to?: string; platform?: string }): Promise<string> {
    const since = opts.from ? new Date(opts.from) : new Date(Date.now() - 30 * 86400 * 1000);
    const until = opts.to ? new Date(opts.to) : new Date();

    const qb = this.posts.createQueryBuilder('p')
      .where('p.status IN (:...statuses)', { statuses: PUBLISHED })
      .andWhere('p.publishedAt BETWEEN :since AND :until', { since, until })
      .orderBy('p.publishedAt', 'DESC');
    if (opts.platform) qb.andWhere('p.platform = :platform', { platform: opts.platform });

    const posts = await qb.getMany();

    if (posts.length === 0) {
      return 'platform,contentType,publishedAt,textContent,externalUrl,likes,comments,shares,impressions,engagementRate\n';
    }

    // Latest engagement per post
    const ids = posts.map((p) => p.id);
    const eng = await this.engagement
      .createQueryBuilder('e')
      .where('e.socialPostId IN (:...ids)', { ids })
      .orderBy('e.socialPostId').addOrderBy('e.syncedAt', 'DESC')
      .getMany();
    const latest = new Map<string, PostEngagement>();
    for (const e of eng) {
      if (!latest.has(e.socialPostId)) latest.set(e.socialPostId, e);
    }

    const escape = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    const header = 'platform,contentType,publishedAt,externalUrl,textContent,likes,comments,shares,saves,impressions,reach,engagementRate\n';
    const rows = posts.map((p) => {
      const e = latest.get(p.id);
      return [
        escape(p.platform),
        escape(p.contentType),
        escape(p.publishedAt?.toISOString() ?? ''),
        escape(p.externalUrl ?? ''),
        escape(p.textContent),
        escape(e?.likes ?? 0),
        escape(e?.comments ?? 0),
        escape(e?.shares ?? 0),
        escape(e?.saves ?? 0),
        escape(e?.impressions ?? 0),
        escape(e?.reach ?? 0),
        escape(e?.engagementRate ?? 0),
      ].join(',');
    }).join('\n');
    return header + rows;
  }

  /** Daily engagement timeseries CSV — pivot for charting in Excel */
  async exportTimeseriesCSV(opts: { from?: string; to?: string }): Promise<string> {
    const since = opts.from ? new Date(opts.from) : new Date(Date.now() - 30 * 86400 * 1000);

    const eng = await this.engagement
      .createQueryBuilder('e')
      .leftJoin('e.post', 'p')
      .addSelect(['p.platform'])
      .where('e.syncedAt >= :since', { since })
      .orderBy('e.syncedDate', 'ASC')
      .getMany();

    const header = 'date,platform,likes,comments,shares,impressions\n';
    const rows = eng.map((e) =>
      [
        e.syncedDate,
        e.post?.platform ?? '',
        e.likes, e.comments, e.shares, e.impressions,
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','),
    ).join('\n');
    return header + rows;
  }
}
