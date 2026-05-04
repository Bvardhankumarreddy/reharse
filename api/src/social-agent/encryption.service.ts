import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * AES-256-GCM symmetric encryption for OAuth tokens at rest.
 * Format: <iv-hex>:<authTag-hex>:<cipherText-hex>
 *
 * Key generation (run once, store in env as ENCRYPTION_KEY):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
@Injectable()
export class SocialAgentEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(SocialAgentEncryptionService.name);
  private key: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const hex = this.config.get<string>('ENCRYPTION_KEY');
    if (!hex) {
      this.logger.warn(
        'ENCRYPTION_KEY not set — Social Agent token encryption disabled. ' +
          'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
      return;
    }
    if (hex.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plaintext: string): string {
    if (!this.key) throw new Error('ENCRYPTION_KEY not configured');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  decrypt(payload: string): string {
    if (!this.key) throw new Error('ENCRYPTION_KEY not configured');
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted payload');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
