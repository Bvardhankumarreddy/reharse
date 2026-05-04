import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Req, Res,
  UseGuards, ParseIntPipe, DefaultValuePipe, UploadedFile, UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { SocialAgentService } from './social-agent.service';
import { LinkedInService } from './linkedin.service';
import { InstagramService } from './instagram.service';
import { YouTubeService } from './youtube.service';
import { AnalyticsService } from './analytics.service';
import { InsightsProcessor } from './insights.processor';
import { AudienceSyncProcessor } from './audience-sync.processor';
import { CompetitorService } from './competitor.service';
import { ReportExportService } from './report-export.service';
import { SocialPublishProcessor } from './social-publish.processor';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';
import type { SocialPost, SocialPlatform, SocialContentType, SocialPostStatus } from './social-post.entity';

// ── Admin-protected endpoints ──────────────────────────────────────────────────
@Controller('admin/social-agent')
@UseGuards(AdminGuard)
export class SocialAgentController {
  constructor(
    private readonly service: SocialAgentService,
    private readonly linkedin: LinkedInService,
    private readonly instagram: InstagramService,
    private readonly youtube: YouTubeService,
    private readonly analytics: AnalyticsService,
    private readonly insights: InsightsProcessor,
    private readonly audience: AudienceSyncProcessor,
    private readonly competitors: CompetitorService,
    private readonly reports: ReportExportService,
    private readonly publisher: SocialPublishProcessor,
    private readonly storage: StorageService,
  ) {}

  @Get('stats')
  stats() {
    return this.service.dashboardStats();
  }

  @Post('generate')
  generate(@Body() body: {
    contentType: SocialContentType;
    context: Record<string, unknown>;
    platforms: SocialPlatform[];
    scheduledAt: string;
    imageUrl?: string;
    variants?: number;       // Phase 5: A/B variants per platform (1-3)
    experimentName?: string; // Phase 5: name for the A/B test
  }) {
    return this.service.generate(body);
  }

  @Get('posts')
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: SocialPostStatus | 'all',
    @Query('platform') platform?: SocialPlatform,
    @Query('contentType') contentType?: SocialContentType,
    @Query('search') search?: string,
  ) {
    return this.service.list({ page, limit, status, platform, contentType, search });
  }

  @Get('posts/:id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch('posts/:id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<{ textContent: string; scheduledAt: string; imageUrl: string; linkUrl: string }>,
  ) {
    return this.service.update(id, body);
  }

  @Post('posts/:id/approve')
  approve(@Param('id') id: string, @Req() req: Request) {
    const email = (req as Request & { user?: { email?: string } }).user?.email ?? 'admin';
    return this.service.approve(id, email);
  }

  @Post('posts/:id/regenerate')
  regenerate(@Param('id') id: string) {
    return this.service.regenerate(id);
  }

  @Post('posts/:id/reject')
  reject(@Param('id') id: string) {
    return this.service.reject(id);
  }

  @Post('posts/:id/mark-published')
  markPublished(
    @Param('id') id: string,
    @Body() body: { externalUrl?: string; publishedAt?: string },
  ) {
    return this.service.markPublished(id, body);
  }

  @Delete('posts/:id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }

  // ── Phase 2 ─────────────────────────────────────────────────────────

  /** Manual "Publish Now" — runs the same publisher as the cron */
  @Post('posts/:id/publish-now')
  async publishNow(@Param('id') id: string): Promise<SocialPost> {
    const post = await this.service.get(id);
    await this.publisher.publishOne(post);
    return this.service.get(id); // return refreshed state
  }

  /** GET /api/v1/admin/social-agent/connections — list connected accounts */
  @Get('connections')
  listConnections() {
    return this.linkedin.listConnections();
  }

  /** DELETE /api/v1/admin/social-agent/connections/:platform — revoke connection */
  @Delete('connections/:platform')
  disconnect(@Param('platform') platform: SocialPlatform) {
    return this.linkedin.disconnect(platform);
  }

  /** GET /api/v1/admin/social-agent/connect/linkedin?platform=linkedin_page
   *  Returns the LinkedIn authorize URL — browser navigates client-side. */
  @Get('connect/linkedin')
  connectLinkedin(@Query('platform') platform: SocialPlatform) {
    return { url: this.linkedin.buildAuthorizeUrl(platform) };
  }

  /** GET /api/v1/admin/social-agent/connect/instagram
   *  Returns the Facebook OAuth URL for Instagram Business publishing. */
  @Get('connect/instagram')
  connectInstagram() {
    return { url: this.instagram.buildAuthorizeUrl() };
  }

  /** GET /api/v1/admin/social-agent/connect/youtube — Google OAuth */
  @Get('connect/youtube')
  connectYoutube() {
    return { url: this.youtube.buildAuthorizeUrl() };
  }

  /** GET /api/v1/admin/social-agent/youtube/subscribers — current subscriber count */
  @Get('youtube/subscribers')
  async youtubeSubscribers() {
    const count = await this.youtube.getSubscriberCount();
    return { subscriberCount: count, eligibleForCommunityPosts: (count ?? 0) >= 500 };
  }

  // ── Analytics + Insights ────────────────────────────────────────────

  /** GET /api/v1/admin/social-agent/analytics — 30-day dashboard summary */
  @Get('analytics')
  analyticsSummary() {
    return this.analytics.summary();
  }

  /** POST /api/v1/admin/social-agent/insights/generate — manually trigger Claude analysis */
  @Post('insights/generate')
  generateInsightsNow() {
    return this.insights.triggerNow();
  }

  // ── Phase 5: A/B experiments ─────────────────────────────────────────

  /** GET /api/v1/admin/social-agent/experiments — list all A/B groups with variants */
  @Get('experiments')
  experiments() {
    return this.service.listExperiments();
  }

  // ── Phase 5: Audience demographics ───────────────────────────────────

  /** GET /api/v1/admin/social-agent/audience — latest snapshot per platform */
  @Get('audience')
  audienceLatest() {
    return this.audience.getLatest();
  }

  /** POST /api/v1/admin/social-agent/audience/sync — manually trigger weekly sync */
  @Post('audience/sync')
  audienceSyncNow() {
    return this.audience.tick({} as never);
  }

  // ── Phase 5: Competitor tracking ─────────────────────────────────────

  @Get('competitors')
  listCompetitors() {
    return this.competitors.list();
  }

  @Post('competitors')
  createCompetitor(@Body() body: { platform: SocialPlatform; handle: string; displayName: string; url?: string; followerCount?: number; description?: string }) {
    return this.competitors.create(body);
  }

  @Patch('competitors/:id')
  updateCompetitor(@Param('id') id: string, @Body() body: Partial<{ handle: string; displayName: string; url: string; followerCount: number; description: string }>) {
    return this.competitors.update(id, body);
  }

  @Delete('competitors/:id')
  removeCompetitor(@Param('id') id: string) {
    return this.competitors.remove(id);
  }

  @Post('competitors/:id/notes')
  addCompetitorNote(
    @Param('id') id: string,
    @Body() body: { content: string; referenceUrl?: string },
    @Req() req: Request,
  ) {
    const email = (req as Request & { user?: { email?: string } }).user?.email ?? 'admin';
    return this.competitors.addNote(id, body.content, body.referenceUrl ?? null, email);
  }

  @Delete('competitors/notes/:noteId')
  deleteCompetitorNote(@Param('noteId') noteId: string) {
    return this.competitors.deleteNote(noteId);
  }

  // ── Phase 5: Report exports ──────────────────────────────────────────

  /** GET /api/v1/admin/social-agent/reports/posts.csv?from=...&to=...&platform=... */
  @Get('reports/posts.csv')
  async exportPostsReport(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('platform') platform: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportPostsCSV({ from, to, platform });
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=social_posts_${ts}.csv`);
    res.send(csv);
  }

  /** GET /api/v1/admin/social-agent/reports/timeseries.csv?from=... */
  @Get('reports/timeseries.csv')
  async exportTimeseriesReport(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportTimeseriesCSV({ from, to });
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=social_timeseries_${ts}.csv`);
    res.send(csv);
  }

  /** POST /api/v1/admin/social-agent/upload-image
   *  Multipart upload → S3 via existing StorageService → returns 24-hour presigned URL.
   *  Instagram requires a publicly fetchable image URL during media-container creation. */
  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async uploadImage(@UploadedFile() file: Express.Multer.File): Promise<{ url: string; key: string }> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image (JPG/PNG/WebP)');
    }
    if (!this.storage.isConfigured()) {
      throw new BadRequestException(
        'Storage not configured. Set STORAGE_LAMBDA_URL + STORAGE_LAMBDA_SECRET env vars.',
      );
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
    const key = `social-posts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

    await this.storage.upload(key, file.buffer, file.mimetype);

    // Long-lived presigned URL — Instagram fetches the image during container
    // creation (immediate). 24h covers slow-processing scenarios.
    const url = await this.storage.getPresignedUrl(key, 86400);
    return { url, key };
  }
}

// ── OAuth callbacks — public routes (providers redirect browsers here) ───────
@Controller('social-agent/oauth')
export class SocialAgentOAuthController {
  constructor(
    private readonly linkedin: LinkedInService,
    private readonly instagram: InstagramService,
    private readonly youtube: YouTubeService,
    private readonly config: ConfigService,
  ) {}

  /** GET /api/v1/social-agent/oauth/linkedin/callback?code=...&state=... */
  @Get('linkedin/callback')
  async linkedinCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const dest = this.destBuilder();

    if (error) return res.redirect(dest('error=oauth', `LinkedIn error: ${error}`));
    if (!code || !state) return res.redirect(dest('error=oauth', 'Missing code or state'));

    try {
      const { platform, accountName } = await this.linkedin.handleCallback(code, state);
      return res.redirect(dest('connected', `${platform}:${accountName}`));
    } catch (e) {
      return res.redirect(dest('error=callback', (e as Error).message));
    }
  }

  /** GET /api/v1/social-agent/oauth/instagram/callback?code=...&state=... */
  @Get('instagram/callback')
  async instagramCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDesc: string | undefined,
    @Res() res: Response,
  ) {
    const dest = this.destBuilder();

    if (error) return res.redirect(dest('error=oauth', `Instagram error: ${errorDesc ?? error}`));
    if (!code || !state) return res.redirect(dest('error=oauth', 'Missing code or state'));

    try {
      const { accountName } = await this.instagram.handleCallback(code, state);
      return res.redirect(dest('connected', `instagram_feed:${accountName}`));
    } catch (e) {
      return res.redirect(dest('error=callback', (e as Error).message));
    }
  }

  /** GET /api/v1/social-agent/oauth/youtube/callback?code=...&state=... */
  @Get('youtube/callback')
  async youtubeCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const dest = this.destBuilder();

    if (error) return res.redirect(dest('error=oauth', `YouTube error: ${error}`));
    if (!code || !state) return res.redirect(dest('error=oauth', 'Missing code or state'));

    try {
      const { accountName, subscriberCount } = await this.youtube.handleCallback(code, state);
      const eligible = subscriberCount >= 500 ? '' : ` (Note: needs 500+ subs for community posts; you have ${subscriberCount})`;
      return res.redirect(dest('connected', `youtube_community:${accountName}${eligible}`));
    } catch (e) {
      return res.redirect(dest('error=callback', (e as Error).message));
    }
  }

  private destBuilder() {
    const appUrl = this.config.get<string>('FRONTEND_URL') ?? 'https://reharse.inferix.in';
    return (status: string, msg = '') =>
      `${appUrl}/admin/social-agent/connections?${status}&msg=${encodeURIComponent(msg)}`;
  }
}
