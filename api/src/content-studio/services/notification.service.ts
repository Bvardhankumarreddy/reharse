import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Slack incoming-webhook notifier. Dormant when CS_SLACK_WEBHOOK_URL is
 * unset (same pattern as HeyGen / Adzuna / YouTube OAuth). Never throws
 * to the caller — Slack being down must not break a cron or a pipeline.
 *
 * Convention: messages are one-line; emoji prefix indicates kind.
 *   :white_check_mark:  / :x:  — pipeline run success / failure
 *   :robot_face:                — cron run (only when non-empty per the
 *                                 spec'd "only meaningful runs" mode)
 *   :warning:                   — DLQ writes / soft failures
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly webhookUrl: string | null;

  constructor(config: ConfigService) {
    this.webhookUrl = config.get<string>('contentStudio.notifications.slackWebhookUrl') ?? null;
    if (!this.webhookUrl) {
      this.logger.warn('CS_SLACK_WEBHOOK_URL not set — Slack notifications dormant');
    }
  }

  isConfigured(): boolean {
    return this.webhookUrl !== null;
  }

  /** Fire-and-forget. Logs but never throws. */
  async notify(text: string): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      await axios.post(
        this.webhookUrl,
        { text },
        { timeout: 8_000, headers: { 'Content-Type': 'application/json' } },
      );
    } catch (e) {
      this.logger.warn(`Slack notify failed: ${(e as Error).message}`);
    }
  }
}
