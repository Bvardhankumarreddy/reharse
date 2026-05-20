import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Phase D / D3 — exchanges the configured YouTube OAuth refresh token for
 * a short-lived access token. Memoised until ~5 min before expiry. Dormant
 * (returns null) when CS_YT_OAUTH_* envs aren't all set.
 *
 * Spec env (set on the api Deployment when you wire OAuth):
 *   CS_YT_OAUTH_CLIENT_ID
 *   CS_YT_OAUTH_CLIENT_SECRET
 *   CS_YT_OAUTH_REFRESH_TOKEN
 */
@Injectable()
export class YouTubeOAuthService {
  private readonly logger = new Logger(YouTubeOAuthService.name);
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      !!this.config.get<string>('contentStudio.youtube.oauthClientId') &&
      !!this.config.get<string>('contentStudio.youtube.oauthClientSecret') &&
      !!this.config.get<string>('contentStudio.youtube.oauthRefreshToken')
    );
  }

  async accessToken(): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const now = Date.now();
    if (this.cached && this.cached.expiresAt - 5 * 60_000 > now) {
      return this.cached.token;
    }
    try {
      const { data } = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          client_id: this.config.get<string>('contentStudio.youtube.oauthClientId')!,
          client_secret: this.config.get<string>('contentStudio.youtube.oauthClientSecret')!,
          refresh_token: this.config.get<string>('contentStudio.youtube.oauthRefreshToken')!,
          grant_type: 'refresh_token',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15_000,
        },
      );
      const token = String(data?.access_token ?? '');
      const expiresInSec = Number(data?.expires_in ?? 3600);
      if (!token) throw new Error('No access_token in OAuth response');
      this.cached = { token, expiresAt: now + expiresInSec * 1000 };
      return token;
    } catch (e) {
      this.logger.error(`YouTube OAuth refresh failed: ${(e as Error).message}`);
      this.cached = null;
      return null;
    }
  }
}
