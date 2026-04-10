/**
 * StorageService
 *
 * Calls the Resume Storage Lambda via its Function URL.
 * No AWS credentials in NestJS — the Lambda runs with an IAM role.
 * Requests are authenticated with a shared secret (x-secret header).
 *
 * Required env vars:
 *   STORAGE_LAMBDA_URL    — Lambda Function URL, e.g. https://abc123.lambda-url.ap-south-1.on.aws
 *   STORAGE_LAMBDA_SECRET — shared secret (must match LAMBDA_SECRET set in Lambda console)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly baseUrl: string | undefined;
  private readonly secret:  string | undefined;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('STORAGE_LAMBDA_URL');
    this.secret  = config.get<string>('STORAGE_LAMBDA_SECRET');

    if (this.baseUrl && this.secret) {
      this.logger.log(`[Storage] Lambda Function URL configured → ${this.baseUrl}`);
    } else {
      this.logger.warn('[Storage] STORAGE_LAMBDA_URL / STORAGE_LAMBDA_SECRET not set — S3 uploads disabled');
    }
  }

  isConfigured(): boolean {
    return !!(this.baseUrl && this.secret);
  }

  // ── Internal HTTP helper ────────────────────────────────────────────────────

  private async call<T>(
    method: 'POST' | 'DELETE',
    path:   string,
    body:   Record<string, unknown>,
  ): Promise<T> {
    if (!this.baseUrl || !this.secret) throw new Error('Storage Lambda not configured');

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-secret':     this.secret,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(`Storage Lambda error ${res.status}: ${(json as { error?: string }).error ?? res.statusText}`);
    }

    return json as T;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Upload a file buffer to S3 via Lambda. Returns the S3 key. */
  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const { key: savedKey } = await this.call<{ key: string }>('POST', '/upload', {
      key,
      content:     buffer.toString('base64'),
      contentType,
    });
    this.logger.log(`[Storage] Uploaded → ${savedKey}`);
    return savedKey;
  }

  /** Generate a presigned GET URL (default 15 min TTL) via Lambda. */
  async getPresignedUrl(key: string, expiresIn = 900): Promise<string> {
    const { url } = await this.call<{ url: string }>('POST', '/presign', { key, expiresIn });
    return url;
  }

  /** Delete an S3 object via Lambda (best-effort, never throws). */
  async delete(key: string): Promise<void> {
    await this.call('DELETE', '/object', { key }).catch((err) =>
      this.logger.warn(`[Storage] Delete failed for ${key}: ${(err as Error).message}`),
    );
  }

  // ── Key builder ─────────────────────────────────────────────────────────────

  /** Scoped S3 key: resumes/{name-slug}-{userId}/{timestamp}-{safeFilename} */
  static resumeKey(
    userId: string,
    originalName: string,
    firstName?: string | null,
    lastName?: string | null,
  ): string {
    const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const namePart = `${firstName ?? ''}${lastName ? `-${lastName}` : ''}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const folder = namePart ? `${namePart}-${userId}` : userId;
    return `resumes/${folder}/${Date.now()}-${safe}`;
  }
}
