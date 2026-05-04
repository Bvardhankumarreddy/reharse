import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, FindOptionsWhere, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  SocialPost, SocialPlatform, SocialContentType, SocialPostStatus,
} from './social-post.entity';
import { SocialInsight } from './social-insight.entity';

interface PastLearning {
  finding: string;
  recommendation: string;
}

@Injectable()
export class SocialAgentService {
  constructor(
    @InjectRepository(SocialPost) private readonly posts: Repository<SocialPost>,
    @InjectRepository(SocialInsight) private readonly insights: Repository<SocialInsight>,
    private readonly config: ConfigService,
  ) {}

  /** Phase 5: pull the top actionable insights for a platform (or "all") */
  private async getApplicableLearnings(platform: SocialPlatform): Promise<PastLearning[]> {
    const list = await this.insights.find({
      where: [
        { isActionable: true, platform: In([platform, 'all']) as unknown as string },
        { isActionable: true, platform: null as unknown as string },
      ],
      order: { confidenceScore: 'DESC', generatedAt: 'DESC' },
      take: 3, // keep prompt focused
    });
    return list
      .filter((i) => Number(i.confidenceScore) >= 0.5) // ignore low-confidence noise
      .map((i) => ({
        finding: String((i.insightData as { finding?: string })?.finding ?? ''),
        recommendation: String((i.insightData as { recommendation?: string })?.recommendation ?? ''),
      }))
      .filter((l) => l.finding && l.recommendation);
  }

  // ── Generation ────────────────────────────────────────────────────────

  async generate(opts: {
    contentType: SocialContentType;
    context: Record<string, unknown>;
    platforms: SocialPlatform[];
    scheduledAt: string;
    imageUrl?: string; // Instagram needs an image — attached to instagram_* posts
    variants?: number; // Phase 5: A/B testing — generate N variants per platform (1-3)
    experimentName?: string; // Phase 5: when variants > 1, group them under this experiment
  }): Promise<SocialPost[]> {
    const { contentType, context, platforms, scheduledAt, imageUrl } = opts;
    const variants = Math.min(3, Math.max(1, opts.variants ?? 1));
    if (!platforms?.length) throw new BadRequestException('At least one platform required');
    if (!contentType) throw new BadRequestException('contentType required');
    if (!scheduledAt) throw new BadRequestException('scheduledAt required');

    // Validate: any instagram_feed selection requires an image
    const hasInstagramFeed = platforms.some((p) => p === 'instagram_feed');
    if (hasInstagramFeed && !imageUrl) {
      throw new BadRequestException('Instagram Feed posts require an image — upload one first');
    }

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    const generated: SocialPost[] = [];

    // One experimentId per call when variants > 1 — links the variants in analytics
    const experimentId = variants > 1
      ? (opts.experimentName?.trim() || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      : null;

    for (const platform of platforms) {
      // Phase 5: fetch top actionable learnings for this platform once per platform
      const pastLearnings = await this.getApplicableLearnings(platform);

      for (let v = 0; v < variants; v++) {
        const text = await this.callClaude(aiUrl, platform, contentType, context, pastLearnings);
        const entity = this.posts.create({
          platform,
          contentType,
          textContent: text,
          imageUrl: platform.startsWith('instagram') ? imageUrl ?? null : null,
          scheduledAt: new Date(scheduledAt),
          status: 'pending_approval',
          generatedBy: 'claude',
          generationContext: {
            contentType,
            context,
            platform,
            imageUrl,
            appliedLearnings: pastLearnings,
            experimentId,
            variantIndex: experimentId ? v : null,
          },
        });
        generated.push(await this.posts.save(entity));
      }
    }
    return generated;
  }

  private async callClaude(
    aiUrl: string,
    platform: SocialPlatform,
    contentType: SocialContentType,
    context: Record<string, unknown>,
    pastLearnings: PastLearning[] = [],
  ): Promise<string> {
    const res = await fetch(`${aiUrl}/social-post/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform,
        content_type: contentType,
        context,
        past_learnings: pastLearnings,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => 'AI engine error');
      throw new Error(`AI engine ${res.status}: ${body}`);
    }
    const json = (await res.json()) as { text: string };
    return json.text;
  }

  async regenerate(id: string): Promise<SocialPost> {
    const post = await this.posts.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    if (!post.generationContext) throw new BadRequestException('No generation context — cannot regenerate');

    const ctx = post.generationContext as {
      contentType: SocialContentType;
      context: Record<string, unknown>;
      platform: SocialPlatform;
    };
    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    const pastLearnings = await this.getApplicableLearnings(ctx.platform);
    const text = await this.callClaude(aiUrl, ctx.platform, ctx.contentType, ctx.context, pastLearnings);

    post.textContent = text;
    post.status = 'pending_approval';
    post.approvedAt = null;
    post.approvedBy = null;
    // Update generation context with the new applied learnings
    post.generationContext = {
      ...(post.generationContext ?? {}),
      appliedLearnings: pastLearnings,
    };
    return this.posts.save(post);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────

  async list(opts: {
    page: number;
    limit: number;
    status?: SocialPostStatus | 'all';
    platform?: SocialPlatform;
    contentType?: SocialContentType;
    search?: string;
  }) {
    const { page, limit, status, platform, contentType, search } = opts;
    const qb = this.posts
      .createQueryBuilder('p')
      .orderBy('p.scheduledAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status && status !== 'all') qb.andWhere('p.status = :status', { status });
    if (platform) qb.andWhere('p.platform = :platform', { platform });
    if (contentType) qb.andWhere('p.contentType = :contentType', { contentType });
    if (search) qb.andWhere('p.textContent ILIKE :s', { s: `%${search}%` });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async get(id: string): Promise<SocialPost> {
    const post = await this.posts.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async update(
    id: string,
    body: Partial<{ textContent: string; scheduledAt: string; imageUrl: string; linkUrl: string }>,
  ): Promise<SocialPost> {
    const post = await this.get(id);
    if (post.status === 'published_manual') {
      throw new BadRequestException('Cannot edit a published post');
    }
    if (body.textContent !== undefined) post.textContent = body.textContent;
    if (body.scheduledAt !== undefined) post.scheduledAt = new Date(body.scheduledAt);
    if (body.imageUrl !== undefined) post.imageUrl = body.imageUrl || null;
    if (body.linkUrl !== undefined) post.linkUrl = body.linkUrl || null;
    return this.posts.save(post);
  }

  async approve(id: string, approvedBy: string): Promise<SocialPost> {
    const post = await this.get(id);
    post.status = 'approved';
    post.approvedAt = new Date();
    post.approvedBy = approvedBy;
    return this.posts.save(post);
  }

  async reject(id: string): Promise<SocialPost> {
    const post = await this.get(id);
    post.status = 'rejected';
    return this.posts.save(post);
  }

  async markPublished(id: string, body: { externalUrl?: string; publishedAt?: string }): Promise<SocialPost> {
    const post = await this.get(id);
    post.status = 'published_manual';
    post.publishedAt = body.publishedAt ? new Date(body.publishedAt) : new Date();
    if (body.externalUrl) post.externalUrl = body.externalUrl;
    return this.posts.save(post);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const post = await this.get(id);
    await this.posts.remove(post);
    return { deleted: true };
  }

  // ── Dashboard stats ───────────────────────────────────────────────────

  async dashboardStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [pending, scheduledToday, publishedThisWeek, generatedThisMonth, recent] = await Promise.all([
      this.posts.count({ where: { status: 'pending_approval' } }),
      this.posts.count({
        where: {
          status: 'approved',
          scheduledAt: Between(startOfDay, endOfDay),
        } as FindOptionsWhere<SocialPost>,
      }),
      this.posts.count({
        where: {
          status: 'published_manual',
          publishedAt: MoreThanOrEqual(startOfWeek),
        } as FindOptionsWhere<SocialPost>,
      }),
      this.posts.count({
        where: {
          generatedBy: 'claude',
          createdAt: MoreThanOrEqual(startOfMonth),
        } as FindOptionsWhere<SocialPost>,
      }),
      this.posts.find({ order: { updatedAt: 'DESC' }, take: 10 }),
    ]);

    return { pending, scheduledToday, publishedThisWeek, generatedThisMonth, recent };
  }

  // ── Phase 5: A/B experiments ──────────────────────────────────────────

  /** Group posts by experimentId (from generationContext) — used by analytics */
  async listExperiments(): Promise<Array<{
    experimentId: string;
    platform: SocialPlatform;
    contentType: SocialContentType;
    variantCount: number;
    posts: SocialPost[];
    createdAt: Date;
  }>> {
    // jsonb path query — TypeORM doesn't have a clean DSL for this; raw sql is simplest
    const rows = await this.posts
      .createQueryBuilder('p')
      .where(`p."generationContext"->>'experimentId' IS NOT NULL`)
      .orderBy('p.createdAt', 'DESC')
      .getMany();

    const groups = new Map<string, SocialPost[]>();
    for (const p of rows) {
      const ctx = p.generationContext as { experimentId?: string };
      const id = ctx?.experimentId;
      if (!id) continue;
      const arr = groups.get(id) ?? [];
      arr.push(p);
      groups.set(id, arr);
    }

    return Array.from(groups.entries())
      .filter(([, posts]) => posts.length >= 2) // only true A/B groups
      .map(([experimentId, posts]) => ({
        experimentId,
        platform: posts[0].platform,
        contentType: posts[0].contentType,
        variantCount: posts.length,
        posts,
        createdAt: new Date(Math.min(...posts.map((p) => p.createdAt.getTime()))),
      }));
  }
}
