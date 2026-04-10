import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { CalendarService } from './calendar.service';

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly config:   ConfigService,
  ) {}

  /**
   * GET /api/v1/calendar/auth-url
   * Returns the Google OAuth URL. Frontend navigates the window to it.
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Get('auth-url')
  async getAuthUrl(@CurrentUser() user: ClerkUser): Promise<{ url: string }> {
    try {
      return { url: await this.calendar.getAuthUrl(user.sub) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('GOOGLE_')) {
        throw new BadRequestException(
          'Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and GOOGLE_STATE_SECRET to your .env file.',
        );
      }
      throw err;
    }
  }

  /**
   * GET /api/v1/calendar/callback
   * Google redirects here after the user grants consent.
   * No ClerkGuard — auth is verified via the signed state JWT.
   */
  @Get('callback')
  async callback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    if (error) {
      return res.redirect(`${frontendUrl}/settings?tab=calendar&error=${encodeURIComponent(error)}`);
    }

    try {
      await this.calendar.handleCallback(code, state);
      return res.redirect(`${frontendUrl}/settings?tab=calendar&connected=true`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OAuth failed';
      return res.redirect(`${frontendUrl}/settings?tab=calendar&error=${encodeURIComponent(msg)}`);
    }
  }

  /**
   * POST /api/v1/calendar/sync
   * Creates a Google Calendar event for the user's interview date.
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Post('sync')
  async sync(@CurrentUser() user: ClerkUser) {
    return this.calendar.syncInterviewEvent(user.sub);
  }

  /**
   * DELETE /api/v1/calendar/disconnect
   * Revokes Google OAuth and removes the stored refresh token.
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Delete('disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: ClerkUser) {
    await this.calendar.disconnect(user.sub);
  }
}
