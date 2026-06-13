import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

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
}
