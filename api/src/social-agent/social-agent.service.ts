import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, FindOptionsWhere } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  SocialPost, SocialPlatform, SocialContentType, SocialPostStatus,
} from './social-post.entity';

@Injectable()
export class SocialAgentService {
  constructor(
    @InjectRepository(SocialPost) private readonly posts: Repository<SocialPost>,
    private readonly config: ConfigService,
  ) {}

  // ── Generation ────────────────────────────────────────────────────────

  async generate(opts: {
    contentType: SocialContentType;
    context: Record<string, unknown>;
    platforms: SocialPlatform[];
    scheduledAt: string;
  }): Promise<SocialPost[]> {
    const { contentType, context, platforms, scheduledAt } = opts;
    if (!platforms?.length) throw new BadRequestException('At least one platform required');
    if (!contentType) throw new BadRequestException('contentType required');
    if (!scheduledAt) throw new BadRequestException('scheduledAt required');

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    const generated: SocialPost[] = [];

    for (const platform of platforms) {
      const text = await this.callClaude(aiUrl, platform, contentType, context);
      const entity = this.posts.create({
        platform,
        contentType,
        textContent: text,
        scheduledAt: new Date(scheduledAt),
        status: 'pending_approval',
        generatedBy: 'claude',
        generationContext: { contentType, context, platform },
      });
      generated.push(await this.posts.save(entity));
    }
    return generated;
  }

  private async callClaude(
    aiUrl: string,
    platform: SocialPlatform,
    contentType: SocialContentType,
    context: Record<string, unknown>,
  ): Promise<string> {
    const res = await fetch(`${aiUrl}/social-post/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, content_type: contentType, context }),
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
    const text = await this.callClaude(aiUrl, ctx.platform, ctx.contentType, ctx.context);

    post.textContent = text;
    post.status = 'pending_approval';
    post.approvedAt = null;
    post.approvedBy = null;
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
}
