import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { SocialPost } from './social-post.entity';
import { PostEngagement } from './post-engagement.entity';
import { SocialInsight } from './social-insight.entity';

const PUBLISHED_STATUSES = ['published_auto', 'published_manual'] as const;

interface LatestEngagement {
  socialPostId: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  impressions: number;
  reach: number;
  engagementRate: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(SocialPost) private readonly posts: Repository<SocialPost>,
    @InjectRepository(PostEngagement) private readonly engagement: Repository<PostEngagement>,
    @InjectRepository(SocialInsight) private readonly insights: Repository<SocialInsight>,
  ) {}

  /** Returns dashboard summary for the trailing 30 days */
  async summary() {
    const since = new Date(Date.now() - 30 * 86400 * 1000);

    const posts = await this.posts.find({
      where: {
        status: In(PUBLISHED_STATUSES as unknown as string[]),
        publishedAt: MoreThanOrEqual(since),
      },
      order: { publishedAt: 'DESC' },
    });

    const totalPosts = posts.length;

    if (totalPosts === 0) {
      return {
        period: { since: since.toISOString(), until: new Date().toISOString() },
        totalPosts: 0,
        totalEngagement: { likes: 0, comments: 0, shares: 0, saves: 0, impressions: 0 },
        avgEngagementRate: 0,
        platformComparison: [],
        contentTypePerformance: [],
        engagementTrend: [],
        topPosts: [],
        insights: [],
      };
    }

    // Pull latest engagement snapshot per post
    const postIds = posts.map((p) => p.id);
    const allEng = await this.engagement
      .createQueryBuilder('e')
      .where('e.socialPostId IN (:...ids)', { ids: postIds })
      .orderBy('e.socialPostId')
      .addOrderBy('e.syncedAt', 'DESC')
      .getMany();

    const latestByPost = new Map<string, LatestEngagement>();
    for (const e of allEng) {
      if (!latestByPost.has(e.socialPostId)) {
        latestByPost.set(e.socialPostId, {
          socialPostId: e.socialPostId,
          likes: e.likes, comments: e.comments, shares: e.shares,
          saves: e.saves, impressions: e.impressions, reach: e.reach,
          engagementRate: Number(e.engagementRate),
        });
      }
    }

    let likes = 0, comments = 0, shares = 0, saves = 0, impressions = 0;
    for (const e of latestByPost.values()) {
      likes += e.likes;
      comments += e.comments;
      shares += e.shares;
      saves += e.saves;
      impressions += e.impressions;
    }
    const totalEngagement = { likes, comments, shares, saves, impressions };
    const avgEngagementRate = impressions > 0
      ? Math.round(((likes + comments + shares) / impressions) * 10000) / 100
      : 0;

    // Per-platform aggregation
    const platformMap = new Map<string, { posts: number; engagement: number; impressions: number }>();
    for (const p of posts) {
      const e = latestByPost.get(p.id);
      const stats = platformMap.get(p.platform) ?? { posts: 0, engagement: 0, impressions: 0 };
      stats.posts += 1;
      if (e) {
        stats.engagement += e.likes + e.comments + e.shares;
        stats.impressions += e.impressions;
      }
      platformMap.set(p.platform, stats);
    }
    const platformComparison = Array.from(platformMap.entries()).map(([platform, s]) => ({
      platform,
      posts: s.posts,
      engagement: s.engagement,
      impressions: s.impressions,
      avgEngagementPerPost: s.posts > 0 ? Math.round(s.engagement / s.posts) : 0,
      engagementRate: s.impressions > 0 ? Math.round((s.engagement / s.impressions) * 10000) / 100 : 0,
    }));

    // Per-content-type aggregation
    const ctMap = new Map<string, { posts: number; engagement: number }>();
    for (const p of posts) {
      const e = latestByPost.get(p.id);
      const stats = ctMap.get(p.contentType) ?? { posts: 0, engagement: 0 };
      stats.posts += 1;
      if (e) stats.engagement += e.likes + e.comments + e.shares;
      ctMap.set(p.contentType, stats);
    }
    const contentTypePerformance = Array.from(ctMap.entries())
      .map(([contentType, s]) => ({
        contentType, posts: s.posts, engagement: s.engagement,
        avgEngagementPerPost: s.posts > 0 ? Math.round(s.engagement / s.posts) : 0,
      }))
      .sort((a, b) => b.avgEngagementPerPost - a.avgEngagementPerPost);

    // Daily engagement trend (latest snapshot summed by publish date)
    const trendMap = new Map<string, { date: string; likes: number; comments: number; shares: number; impressions: number }>();
    for (const p of posts) {
      if (!p.publishedAt) continue;
      const day = p.publishedAt.toISOString().slice(0, 10);
      const e = latestByPost.get(p.id);
      const stats = trendMap.get(day) ?? { date: day, likes: 0, comments: 0, shares: 0, impressions: 0 };
      if (e) {
        stats.likes += e.likes;
        stats.comments += e.comments;
        stats.shares += e.shares;
        stats.impressions += e.impressions;
      }
      trendMap.set(day, stats);
    }
    const engagementTrend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Top 10 posts by engagement
    const ranked = posts.map((p) => {
      const e = latestByPost.get(p.id);
      return {
        id: p.id,
        platform: p.platform,
        contentType: p.contentType,
        textContent: p.textContent.slice(0, 200),
        externalUrl: p.externalUrl,
        publishedAt: p.publishedAt,
        likes: e?.likes ?? 0,
        comments: e?.comments ?? 0,
        shares: e?.shares ?? 0,
        impressions: e?.impressions ?? 0,
        engagement: (e?.likes ?? 0) + (e?.comments ?? 0) + (e?.shares ?? 0),
      };
    });
    ranked.sort((a, b) => b.engagement - a.engagement);
    const topPosts = ranked.slice(0, 10);

    // Latest 5 actionable insights
    const insights = await this.insights.find({
      where: { isActionable: true },
      order: { generatedAt: 'DESC' },
      take: 5,
    });

    return {
      period: { since: since.toISOString(), until: new Date().toISOString() },
      totalPosts,
      totalEngagement,
      avgEngagementRate,
      platformComparison,
      contentTypePerformance,
      engagementTrend,
      topPosts,
      insights,
    };
  }

  /** Build a compact summary for Claude — used by the insights cron */
  async buildClaudeSummary() {
    const data = await this.summary();
    return {
      total_posts: data.totalPosts,
      total_engagement: data.totalEngagement,
      avg_engagement_rate: data.avgEngagementRate,
      by_platform: data.platformComparison,
      by_content_type: data.contentTypePerformance,
      top_5_posts: data.topPosts.slice(0, 5).map((p) => ({
        platform: p.platform,
        content_type: p.contentType,
        snippet: p.textContent.slice(0, 100),
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        engagement: p.engagement,
      })),
      bottom_3_posts: data.topPosts.slice(-3).map((p) => ({
        platform: p.platform,
        content_type: p.contentType,
        snippet: p.textContent.slice(0, 100),
        engagement: p.engagement,
      })),
      daily_trend: data.engagementTrend,
    };
  }
}
