import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Req,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { SocialAgentService } from './social-agent.service';
import type {
  SocialPlatform, SocialContentType, SocialPostStatus,
} from './social-post.entity';

@Controller('admin/social-agent')
@UseGuards(AdminGuard)
export class SocialAgentController {
  constructor(private readonly service: SocialAgentService) {}

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
}
