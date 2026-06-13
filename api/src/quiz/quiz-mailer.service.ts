import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { randomBytes } from 'crypto';

export interface MailAttachment {
  filename: string;
  /** Raw bytes — will be base64-encoded into the MIME message. */
  content: Buffer | string;
  mimeType: string;
}

/**
 * Quiz mailer — AWS SES v2 transport.
 *
 * Auth chain (SDK picks the first available):
 *   1. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env vars
 *   2. EC2 instance profile (if the node has an IAM role attached)
 *   3. ~/.aws/credentials profile (local dev only)
 *
 * Required env on the api deployment:
 *   QUIZ_MAIL_FROM      e.g. "Rehearse Quiz <quiz@inferix.in>"
 * Optional:
 *   QUIZ_MAIL_REPLY_TO
 *   QUIZ_SES_REGION     defaults to AWS_REGION env, then ap-south-1
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (if no instance role)
 *
 * Dormant (logs + skips) when QUIZ_MAIL_FROM is unset OR the SES
 * client can't be initialized, so dev / staging boot without breaking.
 */
@Injectable()
export class QuizMailerService {
  private readonly logger = new Logger(QuizMailerService.name);
  private readonly client: SESv2Client | null;
  private readonly fromAddress: string | null;
  private readonly replyTo: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.fromAddress = this.config.get<string>('QUIZ_MAIL_FROM') ?? null;
    this.replyTo = this.config.get<string>('QUIZ_MAIL_REPLY_TO');
    const region = this.config.get<string>('QUIZ_SES_REGION')
      ?? this.config.get<string>('AWS_REGION')
      ?? 'ap-south-1';

    if (this.fromAddress) {
      // The SDK will resolve credentials from env vars OR the EC2
      // instance role automatically. No explicit credentials block
      // needed for the common case.
      this.client = new SESv2Client({ region });
      this.logger.log(`Quiz mailer ready: SES ${region} from "${this.fromAddress}"`);
    } else {
      this.client = null;
      this.logger.warn(
        'QUIZ_MAIL_FROM not set — quiz emails will be skipped (dev mode)',
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null && this.fromAddress !== null;
  }

  async send(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId: string | null }> {
    if (!this.client || !this.fromAddress) {
      this.logger.log(`[mail-skip] to=${opts.to} subject="${opts.subject}"`);
      return { messageId: null };
    }
    this.logger.log(`[mail-send] BEGIN to=${opts.to} subject="${opts.subject}"`);
    try {
      const result = await this.client.send(new SendEmailCommand({
        FromEmailAddress: this.fromAddress,
        Destination: { ToAddresses: [opts.to] },
        ReplyToAddresses: this.replyTo ? [this.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: opts.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: opts.text, Charset: 'UTF-8' },
              Html: { Data: opts.html, Charset: 'UTF-8' },
            },
          },
        },
      }));
      this.logger.log(`[mail-send] OK to=${opts.to} messageId=${result.MessageId ?? '(none)'}`);
      return { messageId: result.MessageId ?? null };
    } catch (e) {
      this.logger.warn(`[mail-send] FAIL to=${opts.to}: ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Send with attachments — uses SES Raw content (MIME multipart).
   * SES Simple content doesn't support attachments, so for any email
   * that needs a CSV / PDF / image, this is the only path.
   */
  async sendRaw(opts: {
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: MailAttachment[];
  }): Promise<{ messageId: string | null }> {
    if (!this.client || !this.fromAddress) {
      this.logger.log(`[mail-skip-raw] to=${opts.to} subject="${opts.subject}"`);
      return { messageId: null };
    }
    this.logger.log(
      `[mail-send-raw] BEGIN to=${opts.to} subject="${opts.subject}" ` +
      `attachments=${(opts.attachments ?? []).length}`,
    );
    try {
      const mime = buildMime({
        from: this.fromAddress,
        to: opts.to,
        replyTo: this.replyTo,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        attachments: opts.attachments ?? [],
      });
      const result = await this.client.send(new SendEmailCommand({
        FromEmailAddress: this.fromAddress,
        Destination: { ToAddresses: [opts.to] },
        ReplyToAddresses: this.replyTo ? [this.replyTo] : undefined,
        Content: { Raw: { Data: mime } },
      }));
      this.logger.log(`[mail-send-raw] OK to=${opts.to} messageId=${result.MessageId ?? '(none)'}`);
      return { messageId: result.MessageId ?? null };
    } catch (e) {
      this.logger.warn(`[mail-send-raw] FAIL to=${opts.to}: ${(e as Error).message}`);
      throw e;
    }
  }
}

/**
 * Hand-built MIME message — avoids pulling in another dep just for
 * envelope construction. Structure:
 *   multipart/mixed
 *   ├── multipart/alternative
 *   │   ├── text/plain  (fallback for clients that don't render HTML)
 *   │   └── text/html
 *   └── <each attachment as base64-encoded part>
 * Returns a Buffer suitable for SES Raw.Data.
 */
function buildMime(opts: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
}): Buffer {
  const altBoundary = `alt_${randomBytes(8).toString('hex')}`;
  const mixedBoundary = `mix_${randomBytes(8).toString('hex')}`;
  const CRLF = '\r\n';
  const lines: string[] = [];

  // Top headers
  lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`);
  if (opts.replyTo) lines.push(`Reply-To: ${opts.replyTo}`);
  lines.push(`Subject: ${encodeSubjectIfNeeded(opts.subject)}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  lines.push('');

  // Alternative wrapper for text + html
  lines.push(`--${mixedBoundary}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  lines.push('');

  lines.push(`--${altBoundary}`);
  lines.push(`Content-Type: text/plain; charset=UTF-8`);
  lines.push(`Content-Transfer-Encoding: base64`);
  lines.push('');
  lines.push(Buffer.from(opts.text, 'utf-8').toString('base64'));

  lines.push(`--${altBoundary}`);
  lines.push(`Content-Type: text/html; charset=UTF-8`);
  lines.push(`Content-Transfer-Encoding: base64`);
  lines.push('');
  lines.push(Buffer.from(opts.html, 'utf-8').toString('base64'));

  lines.push(`--${altBoundary}--`);

  // Attachments (each its own part inside multipart/mixed)
  for (const att of opts.attachments) {
    const data = Buffer.isBuffer(att.content)
      ? att.content
      : Buffer.from(att.content, 'utf-8');
    lines.push(`--${mixedBoundary}`);
    lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push('');
    // Wrap base64 at 76 chars per RFC 2045.
    const b64 = data.toString('base64').match(/.{1,76}/g)?.join(CRLF) ?? '';
    lines.push(b64);
  }

  lines.push(`--${mixedBoundary}--`);
  lines.push('');

  return Buffer.from(lines.join(CRLF), 'utf-8');
}

/** Encode UTF-8 subjects with non-ASCII (emoji etc.) per RFC 2047. */
function encodeSubjectIfNeeded(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
}
