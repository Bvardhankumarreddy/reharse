import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Tiny mailer wrapper for the quiz-notification flow. Reads SMTP config
 * from env on first use and caches the transport. Dormant (logs + skips)
 * when SMTP env vars aren't set, so dev / staging boot without breaking.
 *
 * Required env:
 *   QUIZ_MAIL_HOST       (e.g. email-smtp.ap-south-1.amazonaws.com for SES)
 *   QUIZ_MAIL_PORT       (587 = STARTTLS, 465 = TLS)
 *   QUIZ_MAIL_USER
 *   QUIZ_MAIL_PASS
 *   QUIZ_MAIL_FROM       (e.g. "Rehearse Quiz <quiz@reharse.inferix.in>")
 * Optional:
 *   QUIZ_MAIL_REPLY_TO
 */
@Injectable()
export class QuizMailerService {
  private readonly logger = new Logger(QuizMailerService.name);
  private transport: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;
  private readonly replyTo: string | undefined;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('QUIZ_MAIL_HOST');
    const portStr = this.config.get<string>('QUIZ_MAIL_PORT');
    const user = this.config.get<string>('QUIZ_MAIL_USER');
    const pass = this.config.get<string>('QUIZ_MAIL_PASS');
    this.fromAddress = this.config.get<string>('QUIZ_MAIL_FROM')
      ?? 'Rehearse Quiz <quiz@reharse.inferix.in>';
    this.replyTo = this.config.get<string>('QUIZ_MAIL_REPLY_TO');

    if (host && user && pass) {
      const port = Number(portStr ?? 587);
      this.transport = nodemailer.createTransport({
        host, port,
        secure: port === 465,        // implicit TLS only on 465
        auth: { user, pass },
      });
      this.logger.log(`Quiz mailer ready: ${host}:${port} from "${this.fromAddress}"`);
    } else {
      this.logger.warn('QUIZ_MAIL_* env vars not set — quiz emails will be skipped (dev mode)');
    }
  }

  isConfigured(): boolean {
    return this.transport !== null;
  }

  async send(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId: string | null }> {
    if (!this.transport) {
      this.logger.log(`[mail-skip] to=${opts.to} subject="${opts.subject}"`);
      return { messageId: null };
    }
    try {
      const info = await this.transport.sendMail({
        from: this.fromAddress,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        replyTo: this.replyTo,
      });
      return { messageId: info.messageId ?? null };
    } catch (e) {
      this.logger.warn(`Quiz mail to ${opts.to} failed: ${(e as Error).message}`);
      throw e;
    }
  }
}
