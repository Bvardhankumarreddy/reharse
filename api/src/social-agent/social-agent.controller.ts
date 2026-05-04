import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Req, Res,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { SocialAgentService } from './social-agent.service';
import { LinkedInService } from './linkedin.service';
import { SocialPublishProcessor } from './social-publish.processor';
import { ConfigService } from '@nestjs/config';
import type { SocialPost, SocialPlatform, SocialContentType, SocialPostStatus } from './social-post.entity';

// ── Admin-protected endpoints ──────────────────────────────────────────────────
@Controller('admin/social-agent')
@UseGuards(AdminGuard)
export class SocialAgentController {
  constructor(
    private readonly service: SocialAgentService,
    private readonly linkedin: LinkedInService,
    private readonly publisher: SocialPublishProcessor,
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
}

// ── OAuth callback — public route (LinkedIn redirects browsers here) ──────────
@Controller('social-agent/oauth')
export class SocialAgentOAuthController {
  constructor(
    private readonly linkedin: LinkedInService,
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
    const appUrl = this.config.get<string>('FRONTEND_URL') ?? 'https://reharse.inferix.in';
    const dest = (status: string, msg = '') =>
      `${appUrl}/admin/social-agent/connections?${status}&msg=${encodeURIComponent(msg)}`;

    if (error) return res.redirect(dest('error=oauth', `LinkedIn error: ${error}`));
    if (!code || !state) return res.redirect(dest('error=oauth', 'Missing code or state'));

    try {
      const { platform, accountName } = await this.linkedin.handleCallback(code, state);
      return res.redirect(dest('connected', `${platform}:${accountName}`));
    } catch (e) {
      return res.redirect(dest('error=callback', (e as Error).message));
    }
  }
}
