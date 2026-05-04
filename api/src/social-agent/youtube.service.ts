/**
 * YouTube OAuth + connection storage.
 *
 * IMPORTANT: The public YouTube Data API v3 does NOT support creating
 * Community Posts programmatically (only reading them via channel
 * activities once they're posted manually). This service therefore:
 *  - Implements full OAuth so we can store the connection + channel info
 *  - Reads channel statistics (subscribers / view count) for analytics
 *  - publish() returns a clear "manual posting only" error until Google
 *    opens the API (or you upload a Video which IS supported via
 *    /youtube/v3/videos)
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SocialPlatformConnection } from './social-platform-connection.entity';
import { SocialAgentEncryptionService } from './encryption.service';
import type { SocialPost } from './social-post.entity';

const YT_OAUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const YT_TOKEN = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/youtube/v3';

const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

interface PublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);

  constructor(
    @InjectRepository(SocialPlatformConnection)
    private readonly connections: Repository<SocialPlatformConnection>,
    private readonly config: ConfigService,
    private readonly enc: SocialAgentEncryptionService,
  ) {}

  buildAuthorizeUrl(): string {
    const clientId = this.config.getOrThrow<string>('YOUTUBE_CLIENT_ID');
    const redirect = this.config.getOrThrow<string>('YOUTUBE_REDIRECT_URI');
    const url = new URL(YT_OAUTH);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', YT_SCOPES);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent'); // force refresh_token
    url.searchParams.set('state', this.signState());
    return url.toString();
  }

  async handleCallback(code: string, state: string): Promise<{ accountName: string; subscriberCount: number }> {
    this.verifyState(state);

    const clientId = this.config.getOrThrow<string>('YOUTUBE_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('YOUTUBE_CLIENT_SECRET');
    const redirect = this.config.getOrThrow<string>('YOUTUBE_REDIRECT_URI');

    // 1. Exchange code → tokens
    const tokenRes = await fetch(YT_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new BadRequestException(`YouTube token exchange failed: ${await tokenRes.text()}`);
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // 2. Get channel info
    const chRes = await fetch(
      `${YT_API}/channels?part=snippet,statistics&mine=true`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!chRes.ok) {
      throw new BadRequestException(`YouTube channel fetch failed: ${await chRes.text()}`);
    }
    const chData = (await chRes.json()) as {
      items?: Array<{ id: string; snippet: { title: string }; statistics: { subscriberCount?: string } }>;
    };
    const channel = chData.items?.[0];
    if (!channel) {
      throw new BadRequestException('No YouTube channel found on this account');
    }
    const subscriberCount = parseInt(channel.statistics.subscriberCount ?? '0', 10);

    // 3. Save
    await this.connections.upsert(
      {
        platform: 'youtube_community',
        accountId: channel.id,
        accountName: channel.snippet.title,
        encryptedAccessToken: this.enc.encrypt(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? this.enc.encrypt(tokens.refresh_token) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        isActive: true,
        lastError: null,
      },
      ['platform'],
    );

    return { accountName: channel.snippet.title, subscriberCount };
  }

  async publish(_post: SocialPost): Promise<PublishResult> {
    return {
      success: false,
      error:
        'YouTube Data API v3 does not currently support creating Community Posts programmatically. ' +
        'Copy the approved post text and paste it on YouTube\'s Community tab manually, then click "Mark Published".',
    };
  }

  /** Returns subscriber count for the connected channel — used by Connections UI */
  async getSubscriberCount(): Promise<number | null> {
    const conn = await this.connections.findOne({ where: { platform: 'youtube_community', isActive: true } });
    if (!conn) return null;
    if (conn.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
      try { await this.refreshToken(conn); } catch { return null; }
    }
    try {
      const accessToken = this.enc.decrypt(conn.encryptedAccessToken);
      const res = await fetch(
        `${YT_API}/channels?part=statistics&mine=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { items?: Array<{ statistics: { subscriberCount?: string } }> };
      return parseInt(data.items?.[0]?.statistics.subscriberCount ?? '0', 10);
    } catch (e) {
      this.logger.warn(`Subscriber count fetch failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async refreshToken(conn: SocialPlatformConnection): Promise<void> {
    if (!conn.encryptedRefreshToken) throw new Error('No refresh token — reconnect required');
    const clientId = this.config.getOrThrow<string>('YOUTUBE_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('YOUTUBE_CLIENT_SECRET');
    const refreshToken = this.enc.decrypt(conn.encryptedRefreshToken);

    const res = await fetch(YT_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(`YouTube refresh failed: ${await res.text()}`);
    const tokens = (await res.json()) as { access_token: string; expires_in: number };
    conn.encryptedAccessToken = this.enc.encrypt(tokens.access_token);
    conn.tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await this.connections.save(conn);
  }

  private signState(): string {
    const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    return jwt.sign({ p: 'yt', n: Math.random().toString(36).slice(2) }, secret, { expiresIn: '10m' });
  }

  private verifyState(state: string): void {
    const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    try { jwt.verify(state, secret); }
    catch { throw new BadRequestException('Invalid or expired OAuth state'); }
  }
}
