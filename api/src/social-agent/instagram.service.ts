import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SocialPlatformConnection } from './social-platform-connection.entity';
import { SocialAgentEncryptionService } from './encryption.service';
import type { SocialPost, SocialPlatform } from './social-post.entity';
import type { EngagementStats } from './linkedin.service';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

interface PublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

interface ShortLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // typically 60 days
}

interface FbPage {
  id: string;
  name: string;
  access_token: string;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    @InjectRepository(SocialPlatformConnection)
    private readonly connections: Repository<SocialPlatformConnection>,
    private readonly config: ConfigService,
    private readonly enc: SocialAgentEncryptionService,
  ) {}

  // ── OAuth ─────────────────────────────────────────────────────────

  buildAuthorizeUrl(): string {
    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const redirect = this.config.getOrThrow<string>('META_REDIRECT_URI');

    const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('scope', INSTAGRAM_SCOPES);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', this.signState());
    return url.toString();
  }

  async handleCallback(code: string, state: string): Promise<{ accountName: string }> {
    this.verifyState(state);

    const appId = this.config.getOrThrow<string>('META_APP_ID');
    const appSecret = this.config.getOrThrow<string>('META_APP_SECRET');
    const redirect = this.config.getOrThrow<string>('META_REDIRECT_URI');

    // 1. Exchange code → short-lived token
    const shortRes = await fetch(
      `${FB_GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirect,
          code,
        }),
    );
    if (!shortRes.ok) {
      throw new BadRequestException(`FB token exchange failed: ${await shortRes.text()}`);
    }
    const shortToken = (await shortRes.json()) as ShortLivedTokenResponse;

    // 2. Exchange short-lived → long-lived (60 days)
    const longRes = await fetch(
      `${FB_GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortToken.access_token,
        }),
    );
    if (!longRes.ok) {
      throw new BadRequestException(`FB long-lived exchange failed: ${await longRes.text()}`);
    }
    const longToken = (await longRes.json()) as LongLivedTokenResponse;

    // 3. Fetch user's FB pages
    const pagesRes = await fetch(`${FB_GRAPH}/me/accounts?access_token=${longToken.access_token}`);
    if (!pagesRes.ok) {
      throw new BadRequestException(`FB pages fetch failed: ${await pagesRes.text()}`);
    }
    const pagesData = (await pagesRes.json()) as { data?: FbPage[] };
    const fbPage = pagesData.data?.[0];
    if (!fbPage) {
      throw new BadRequestException(
        'No Facebook page connected. Create a Facebook Page first and link it to your Instagram Business account.',
      );
    }

    // 4. Get IG Business Account linked to this page
    const igRes = await fetch(
      `${FB_GRAPH}/${fbPage.id}?fields=instagram_business_account&access_token=${fbPage.access_token}`,
    );
    if (!igRes.ok) {
      throw new BadRequestException(`Instagram account fetch failed: ${await igRes.text()}`);
    }
    const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
    if (!igData.instagram_business_account?.id) {
      throw new BadRequestException(
        'No Instagram Business Account linked to your Facebook Page. ' +
          'In Instagram app: Settings → Account → Switch to Professional → Business → connect to your Facebook Page.',
      );
    }
    const igAccountId = igData.instagram_business_account.id;

    // 5. Get IG account display name
    const meRes = await fetch(
      `${FB_GRAPH}/${igAccountId}?fields=username&access_token=${fbPage.access_token}`,
    );
    let accountName = fbPage.name;
    if (meRes.ok) {
      const me = (await meRes.json()) as { username?: string };
      if (me.username) accountName = `@${me.username}`;
    }

    // 6. Save: use the PAGE access token (not user token) — this is what publishes to IG
    const expiresAt = new Date(Date.now() + (longToken.expires_in ?? 60 * 86400) * 1000);
    await this.connections.upsert(
      {
        platform: 'instagram_feed',
        accountId: igAccountId,
        accountName,
        encryptedAccessToken: this.enc.encrypt(fbPage.access_token),
        encryptedRefreshToken: null, // Meta doesn't issue refresh tokens — re-OAuth at expiry
        tokenExpiresAt: expiresAt,
        isActive: true,
        lastError: null,
      },
      ['platform'],
    );

    return { accountName };
  }

  // ── Connection management (delegated to LinkedIn service helpers — same logic) ──
  // listConnections + disconnect live in LinkedInService — they query the same table.

  // ── Publishing ────────────────────────────────────────────────────

  async publish(post: SocialPost): Promise<PublishResult> {
    if (!post.imageUrl) {
      return { success: false, error: 'Instagram requires an image (imageUrl is empty)' };
    }
    if (post.platform !== 'instagram_feed') {
      return { success: false, error: `Phase 3 supports instagram_feed only, got ${post.platform}` };
    }

    const conn = await this.connections.findOne({ where: { platform: 'instagram_feed', isActive: true } });
    if (!conn) return { success: false, error: 'Instagram not connected' };
    if (conn.tokenExpiresAt.getTime() <= Date.now()) {
      return { success: false, error: 'Instagram token expired — please reconnect' };
    }

    try {
      const accessToken = this.enc.decrypt(conn.encryptedAccessToken);
      const igAccountId = conn.accountId;

      // 1. Create media container
      const containerRes = await fetch(`${FB_GRAPH}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: post.imageUrl,
          caption: post.textContent,
          access_token: accessToken,
        }),
      });
      if (!containerRes.ok) {
        const err = await containerRes.text();
        await this.recordError(conn, `container: ${err}`);
        return { success: false, error: `IG container failed: ${err.slice(0, 300)}` };
      }
      const container = (await containerRes.json()) as { id: string };
      const containerId = container.id;

      // 2. Poll until container ready (Instagram processes async)
      let status = 'IN_PROGRESS';
      let attempts = 0;
      while (status === 'IN_PROGRESS' && attempts < 10) {
        await new Promise((r) => setTimeout(r, 3000));
        const sRes = await fetch(
          `${FB_GRAPH}/${containerId}?fields=status_code&access_token=${accessToken}`,
        );
        if (!sRes.ok) break;
        const sData = (await sRes.json()) as { status_code?: string };
        status = sData.status_code ?? 'IN_PROGRESS';
        attempts++;
      }
      if (status !== 'FINISHED') {
        await this.recordError(conn, `container status=${status}`);
        return { success: false, error: `IG container did not finish (status=${status})` };
      }

      // 3. Publish the container
      const pubRes = await fetch(`${FB_GRAPH}/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      });
      if (!pubRes.ok) {
        const err = await pubRes.text();
        await this.recordError(conn, `publish: ${err}`);
        return { success: false, error: `IG publish failed: ${err.slice(0, 300)}` };
      }
      const result = (await pubRes.json()) as { id: string };

      // 4. Get permalink (best-effort)
      let externalUrl = `https://www.instagram.com/p/${result.id}`;
      try {
        const linkRes = await fetch(
          `${FB_GRAPH}/${result.id}?fields=permalink&access_token=${accessToken}`,
        );
        if (linkRes.ok) {
          const link = (await linkRes.json()) as { permalink?: string };
          if (link.permalink) externalUrl = link.permalink;
        }
      } catch { /* non-fatal */ }

      conn.lastUsedAt = new Date();
      conn.lastError = null;
      await this.connections.save(conn);

      return { success: true, externalId: result.id, externalUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.recordError(conn, msg);
      return { success: false, error: msg };
    }
  }

  private signState(): string {
    const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    return jwt.sign({ p: 'ig', n: Math.random().toString(36).slice(2) }, secret, { expiresIn: '10m' });
  }

  private verifyState(state: string): void {
    const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    try {
      jwt.verify(state, secret);
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
  }

  private async recordError(conn: SocialPlatformConnection, msg: string): Promise<void> {
    conn.lastError = msg.slice(0, 1000);
    conn.lastUsedAt = new Date();
    await this.connections.save(conn);
  }

  // ── Engagement sync (Phase 4) ───────────────────────────────────────

  /** Fetch insights for a published Instagram post via /insights endpoint */
  async fetchStats(post: SocialPost): Promise<EngagementStats | null> {
    if (!post.externalPostId) return null;
    const conn = await this.connections.findOne({ where: { platform: 'instagram_feed', isActive: true } });
    if (!conn) return null;
    if (conn.tokenExpiresAt.getTime() <= Date.now()) return null;

    try {
      const accessToken = this.enc.decrypt(conn.encryptedAccessToken);
      const metrics = 'likes,comments,shares,saved,reach,impressions';
      const res = await fetch(
        `${FB_GRAPH}/${post.externalPostId}/insights?metric=${metrics}&access_token=${accessToken}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
      };
      const get = (name: string): number =>
        data.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;

      return {
        likes: get('likes'),
        comments: get('comments'),
        shares: get('shares'),
        saves: get('saved'),
        impressions: get('impressions'),
        reach: get('reach'),
        clicks: 0,
        rawData: data as Record<string, unknown>,
      };
    } catch (e) {
      this.logger.warn(`IG stats fetch failed for ${post.id}: ${(e as Error).message}`);
      return null;
    }
  }
}

/** Used by SocialAgentService and admin endpoints to know which platforms support auto-publish. */
export const AUTO_PUBLISH_PLATFORMS: SocialPlatform[] = [
  'linkedin_page',
  'linkedin_personal',
  'instagram_feed',
];

