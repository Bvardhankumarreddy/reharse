import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UserFeedback } from './user-feedback.entity';

export interface SubmitFeedbackDto {
  rating?:   number;
  category?: string;
  message:   string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  bug:     '🐛',
  feature: '💡',
  general: '💬',
  praise:  '❤️',
};

@Injectable()
export class UserFeedbackService {
  private readonly logger = new Logger(UserFeedbackService.name);

  constructor(
    @InjectRepository(UserFeedback) private readonly repo: Repository<UserFeedback>,
    private readonly config: ConfigService,
  ) {}

  async submit(userId: string, dto: SubmitFeedbackDto): Promise<UserFeedback> {
    const feedback = this.repo.create({
      userId,
      rating:   dto.rating   ?? null,
      category: dto.category ?? null,
      message:  dto.message,
    });
    const saved = await this.repo.save(feedback);

    // Best-effort admin notification — never throws
    this.sendAdminEmail(userId, dto).catch((err) =>
      this.logger.warn(`[UserFeedback] Email failed: ${(err as Error).message}`),
    );

    return saved;
  }

  private async sendAdminEmail(userId: string, dto: SubmitFeedbackDto): Promise<void> {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL') ?? 'feedback@rehearse.ai';

    const emoji    = CATEGORY_EMOJI[dto.category ?? ''] ?? '📝';
    const stars    = dto.rating ? '⭐'.repeat(dto.rating) : 'No rating';
    const catLabel = dto.category
      ? dto.category.charAt(0).toUpperCase() + dto.category.slice(1)
      : 'General';

    const subject = `${emoji} [Rehearse Feedback] ${catLabel} — ${stars}`;

    const text = [
      `New user feedback received on Rehearse.`,
      ``,
      `User ID  : ${userId}`,
      `Category : ${catLabel}`,
      `Rating   : ${dto.rating ? `${dto.rating}/5` : 'Not provided'}`,
      ``,
      `Message:`,
      dto.message,
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Rehearse Feedback</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:linear-gradient(135deg,#0EA5E9,#3B82F6);padding:24px 28px;">
              <p style="margin:0;font-size:22px;">${emoji}</p>
              <h1 style="margin:6px 0 0;font-size:18px;font-weight:800;color:#FFFFFF;">${catLabel} Feedback</h1>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${stars}</p>
            </td></tr>
            <tr><td style="padding:24px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td style="padding:10px 14px;font-size:12px;color:#64748B;border-bottom:1px solid #F1F5F9;width:30%;">User ID</td>
                  <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#0F172A;border-bottom:1px solid #F1F5F9;">${userId}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-size:12px;color:#64748B;border-bottom:1px solid #F1F5F9;">Category</td>
                  <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#0F172A;border-bottom:1px solid #F1F5F9;">${catLabel}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-size:12px;color:#64748B;">Rating</td>
                  <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#0F172A;">${dto.rating ? `${dto.rating}/5` : '—'}</td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.6px;">Message</p>
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap;">${dto.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="text-align:center;padding-top:16px;">
          <p style="margin:0;font-size:11px;color:#94A3B8;">Sent automatically by Rehearse · <a href="https://app.rehearse.ai" style="color:#94A3B8;">app.rehearse.ai</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const lambdaUrl = this.config.get<string>('STORAGE_LAMBDA_URL');
    const secret    = this.config.get<string>('STORAGE_LAMBDA_SECRET');

    if (!lambdaUrl || !secret) {
      this.logger.debug(`[Feedback email to ${adminEmail}]\nSubject: ${subject}\n\n${text}`);
      return;
    }

    const res = await fetch(`${lambdaUrl}/email/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body:    JSON.stringify({ to: adminEmail, subject, text, html }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Email Lambda error ${res.status}: ${(body as { error?: string }).error ?? res.statusText}`);
    }

    this.logger.log(`[UserFeedback] Email sent to ${adminEmail}`);
  }
}
