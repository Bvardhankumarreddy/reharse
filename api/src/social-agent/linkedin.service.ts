import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SocialPlatformConnection } from './social-platform-connection.entity';
import { SocialAgentEncryptionService } from './encryption.service';
import type { SocialPlatform } from './social-post.entity';
import type { SocialPost } from './social-post.entity';

const PERSONAL_SCOPES = 'openid profile email w_member_social';
const PAGE_SCOPES =
  'openid profile email w_member_social w_organization_social r_organization_social';

interface LinkedInTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

interface PublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name);

  constructor(
    @InjectRepository(SocialPlatformConnection)
    private readonly connections: Repository<SocialPlatformConnection>,
    private readonly config: ConfigService,
    private readonly enc: SocialAgentEncryptionService,
  ) {}

  // ── OAuth ────────────────────────────────────────────────────────────

  /** Build the LinkedIn authorize URL with a signed state token */
  buildAuthorizeUrl(platform: SocialPlatform): string {
    if (platform !== 'linkedin_page' && platform !== 'linkedin_personal') {
      throw new BadRequestException('Only linkedin_page and linkedin_personal supported');
    }
    const clientId = this.config.getOrThrow<string>('LINKEDIN_CLIENT_ID');
    const redirect = this.config.getOrThrow<string>('LINKEDIN_REDIRECT_URI');
    const scopes = platform === 'linkedin_page' ? PAGE_SCOPES : PERSONAL_SCOPES;
    const state = this.signState(platform);

    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /** Exchange code → tokens, fetch user info, save (encrypted) connection */
  async handleCallback(code: string, state: string): Promise<{ platform: SocialPlatform; accountName: string }> {
    const platform = this.verifyState(state);

    const clientId = this.config.getOrThrow<string>('LINKEDIN_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('LINKEDIN_CLIENT_SECRET');
    const redirect = this.config.getOrThrow<string>('LINKEDIN_REDIRECT_URI');

    // 1. Exchange code for token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new BadRequestException(`LinkedIn token exchange failed: ${body}`);
    }
    const tokens = (await tokenRes.json()) as LinkedInTokens;

    // 2. Fetch user info
    const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      const body = await userRes.text();
      throw new BadRequestException(`LinkedIn userinfo failed: ${body}`);
    }
    const user = (await userRes.json()) as { sub: string; name: string; email?: string };

    let accountId = user.sub;
    let accountName = user.name;

    // 3. For Page connection, fetch first administered organization
    if (platform === 'linkedin_page') {
      try {
        const orgRes = await fetch(
          'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,name)))',
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        const orgData = (await orgRes.json()) as {
          elements?: Array<{ organization: string; 'organization~'?: { id: number; name: string } }>;
        };
        const first = orgData.elements?.[0];
        if (first?.['organization~']) {
          accountId = String(first['organization~'].id);
          accountName = first['organization~'].name;
        } else if (first) {
          // Fallback: extract id from URN like "urn:li:organization:12345"
          const m = first.organization.match(/urn:li:organization:(\d+)/);
          if (m) accountId = m[1];
        }
      } catch (e) {
        this.logger.warn(`Could not fetch organizations: ${(e as Error).message}`);
      }
    }

    // 4. Save (upsert)
    await this.connections.upsert(
      {
        platform,
        accountId,
        accountName,
        encryptedAccessToken: this.enc.encrypt(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? this.enc.encrypt(tokens.refresh_token) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        isActive: true,
        lastError: null,
      },
      ['platform'],
    );

    return { platform, accountName };
  }

  private signState(platform: SocialPlatform): string {
    const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    return jwt.sign({ platform, nonce: Math.random().toString(36).slice(2) }, secret, {
      expiresIn: '10m',
    });
  }

  private verifyState(state: string): SocialPlatform {
    const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    try {
      const decoded = jwt.verify(state, secret) as { platform: SocialPlatform };
      return decoded.platform;
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
  }

  // ── Connections ─────────────────────────────────────────────────────

  async listConnections(): Promise<Array<Omit<SocialPlatformConnection, 'encryptedAccessToken' | 'encryptedRefreshToken'>>> {
    const list = await this.connections.find({ order: { platform: 'ASC' } });
    return list.map((c) => {
      const { encryptedAccessToken: _at, encryptedRefreshToken: _rt, ...rest } = c;
      void _at; void _rt;
      return rest;
    });
  }

  async disconnect(platform: SocialPlatform): Promise<{ deleted: boolean }> {
    const c = await this.connections.findOne({ where: { platform } });
    if (!c) return { deleted: false };
    await this.connections.remove(c);
    return { deleted: true };
  }

  // ── Publishing ───────────────────────────────────────────────────────

  async publish(post: SocialPost): Promise<PublishResult> {
    const conn = await this.connections.findOne({ where: { platform: post.platform, isActive: true } });
    if (!conn) return { success: false, error: `No active connection for ${post.platform}` };

    try {
      // Refresh if expired (with 60-second leeway)
      if (conn.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
        await this.refreshToken(conn);
      }
      const accessToken = this.enc.decrypt(conn.encryptedAccessToken);

      const isPage = post.platform === 'linkedin_page';
      const author = isPage
        ? `urn:li:organization:${conn.accountId}`
        : `urn:li:person:${conn.accountId}`;

      const payload: Record<string, unknown> = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: post.textContent },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        await this.recordError(conn, `${res.status}: ${errorText}`);
        return { success: false, error: `LinkedIn API ${res.status}: ${errorText.slice(0, 300)}` };
      }

      const result = (await res.json()) as { id: string };
      const externalId = result.id;
      const externalUrl = `https://www.linkedin.com/feed/update/${externalId}`;

      conn.lastUsedAt = new Date();
      conn.lastError = null;
      await this.connections.save(conn);

      return { success: true, externalId, externalUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.recordError(conn, msg);
      return { success: false, error: msg };
    }
  }

  private async refreshToken(conn: SocialPlatformConnection): Promise<void> {
    if (!conn.encryptedRefreshToken) {
      throw new Error('No refresh token — user must reconnect');
    }
    const clientId = this.config.getOrThrow<string>('LINKEDIN_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('LINKEDIN_CLIENT_SECRET');

    const refreshToken = this.enc.decrypt(conn.encryptedRefreshToken);
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LinkedIn refresh failed: ${body}`);
    }
    const tokens = (await res.json()) as LinkedInTokens;

    conn.encryptedAccessToken = this.enc.encrypt(tokens.access_token);
    if (tokens.refresh_token) {
      conn.encryptedRefreshToken = this.enc.encrypt(tokens.refresh_token);
    }
    conn.tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await this.connections.save(conn);
  }

  private async recordError(conn: SocialPlatformConnection, msg: string): Promise<void> {
    conn.lastError = msg.slice(0, 1000);
    conn.lastUsedAt = new Date();
    await this.connections.save(conn);
  }
}
