import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import * as jwt from 'jsonwebtoken';
import { User } from '../users/user.entity';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  // ── OAuth client factory ────────────────────────────────────────────────────

  private oauthClient() {
    return new google.auth.OAuth2(
      this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  // ── Step 1: generate the OAuth consent URL ──────────────────────────────────

  private isProUser(user: User): boolean {
    if (user.subscriptionTier !== 'pro') return false;
    if (user.subscriptionStatus === 'active') return true;
    if (user.subscriptionStatus === 'day_pass') {
      return !user.subscriptionEndsAt || user.subscriptionEndsAt > new Date();
    }
    return false;
  }

  async getAuthUrl(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where:  { id: userId },
      select: ['id', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndsAt'],
    });
    if (!user || !this.isProUser(user)) {
      throw new ForbiddenException('Google Calendar sync requires a Pro subscription.');
    }

    const state = jwt.sign(
      { userId },
      this.config.getOrThrow<string>('GOOGLE_STATE_SECRET'),
      { expiresIn: '10m' },
    );

    return this.oauthClient().generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',           // forces refresh_token on every consent
      scope:       ['https://www.googleapis.com/auth/calendar.events'],
      state,
    });
  }

  // ── Step 2: exchange the authorization code for tokens ──────────────────────

  async handleCallback(code: string, state: string): Promise<string> {
    // Verify the state JWT to get the userId — prevents CSRF
    let userId: string;
    try {
      const payload = jwt.verify(
        state,
        this.config.getOrThrow<string>('GOOGLE_STATE_SECRET'),
      ) as { userId: string };
      userId = payload.userId;
    } catch {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const client = this.oauthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on first consent or when prompt=consent
      this.logger.warn(`[Calendar] No refresh_token in callback for user ${userId} — may need to re-authorize`);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    if (tokens.refresh_token) {
      user.googleRefreshToken = tokens.refresh_token;
      await this.userRepo.save(user);
    }

    this.logger.log(`[Calendar] Connected Google Calendar for user ${userId}`);
    return userId;
  }

  // ── Step 3: sync the interview date as a Google Calendar event ──────────────

  async syncInterviewEvent(userId: string): Promise<{ eventId: string; htmlLink: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!this.isProUser(user!)) throw new ForbiddenException('Google Calendar sync requires a Pro subscription.');
    if (!user?.googleRefreshToken) throw new UnauthorizedException('Google Calendar not connected');
    if (!user.interviewDate)       throw new Error('No interview date set');

    const client = this.oauthClient();
    client.setCredentials({ refresh_token: user.googleRefreshToken });

    const calendar = google.calendar({ version: 'v3', auth: client });

    // Build an all-day event on the interview date
    const dateStr = new Date(user.interviewDate).toISOString().slice(0, 10);

    const event = {
      summary:     '🎯 Interview Day — Rehearse',
      description: `You've been preparing for this. Good luck!\n\nPractice more at https://app.rehearse.ai`,
      start:       { date: dateStr },
      end:         { date: dateStr },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 * 24 },    // 1 day before
          { method: 'popup', minutes: 60 * 2  },    // 2 hours before
          { method: 'email', minutes: 60 * 24 * 3 }, // 3 days before
        ],
      },
    };

    const res = await calendar.events.insert({
      calendarId:                'primary',
      requestBody:               event,
      sendNotifications:         true,
      sendUpdates:               'all',
    });

    this.logger.log(`[Calendar] Event created for user ${userId}: ${res.data.id}`);
    return { eventId: res.data.id!, htmlLink: res.data.htmlLink! };
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    // Revoke the token with Google so the app loses access
    if (user.googleRefreshToken) {
      try {
        const client = this.oauthClient();
        await client.revokeToken(user.googleRefreshToken);
      } catch {
        // Best-effort — even if revocation fails, we remove it locally
      }
    }

    user.googleRefreshToken = null;
    await this.userRepo.save(user);
    this.logger.log(`[Calendar] Disconnected Google Calendar for user ${userId}`);
  }

  isConnected(user: User): boolean {
    return !!user.googleRefreshToken;
  }
}
