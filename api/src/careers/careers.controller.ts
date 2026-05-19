import {
  Controller, Get, Post, Param, Query, Body, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { CareersMatchingService } from './services/matching.service';
import type { MatchStatus } from './entities/job-match.entity';

const STATUSES: MatchStatus[] = ['matched', 'saved', 'dismissed', 'applied'];

@Controller('careers')
@UseGuards(ClerkGuard)
export class CareersController {
  constructor(private readonly matching: CareersMatchingService) {}

  /**
   * The user's job matches. First-time visitors (no matches yet) get an
   * automatic best-effort compute so the tab isn't empty on day one.
   */
  @Get('jobs')
  async jobs(
    @CurrentUser() user: ClerkUser,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const st =
      status && STATUSES.includes(status as MatchStatus)
        ? (status as MatchStatus)
        : undefined;

    const existing = await this.matching.listForUser(user.sub, st, q);
    if (existing.length === 0 && !st && !q) {
      try {
        await this.matching.refreshForUser(user.sub);
      } catch {
        /* not configured / no listings yet — return empty gracefully */
      }
      const data = await this.matching.listForUser(user.sub, st, q);
      return { data, count: data.length };
    }
    return { data: existing, count: existing.length };
  }

  /** Force a fresh match run (rate-limited server-side). */
  @Post('refresh')
  refresh(@CurrentUser() user: ClerkUser) {
    return this.matching.refreshForUser(user.sub, true);
  }

  /** Save / dismiss / mark-applied / un-set a match. */
  @Post('jobs/:matchId/status')
  setStatus(
    @CurrentUser() user: ClerkUser,
    @Param('matchId') matchId: string,
    @Body() body: { status?: string },
  ) {
    if (!body.status || !STATUSES.includes(body.status as MatchStatus)) {
      throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}`);
    }
    return this.matching.setStatus(user.sub, matchId, body.status as MatchStatus);
  }
}
