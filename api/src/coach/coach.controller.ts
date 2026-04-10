import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { FeedbackService } from '../feedback/feedback.service';

class CoachMessageItem {
  @IsString()
  role: string;

  @IsString()
  content: string;
}

class CoachMessageDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachMessageItem)
  messages: CoachMessageItem[];

  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}

@ApiTags('coach')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('coach')
export class CoachController {
  constructor(
    private readonly users: UsersService,
    private readonly feedback: FeedbackService,
    private readonly config: ConfigService,
  ) {}

  /** POST /api/v1/coach/message — proxy to AI engine with user context */
  @Post('message')
  async message(
    @CurrentUser() clerkUser: ClerkUser,
    @Body() dto: CoachMessageDto,
  ) {
    const user = await this.users.findById(clerkUser.sub);

    // Build weak areas from recent feedback
    let weakAreas: string[] = [];
    try {
      const allFeedback = await this.feedback.findByUser(clerkUser.sub);
      const counts: Record<string, number> = {};
      for (const f of allFeedback) {
        for (const area of (f.weakAreas ?? [])) {
          counts[area] = (counts[area] ?? 0) + 1;
        }
      }
      weakAreas = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([area]) => area);
    } catch { /* non-critical */ }

    const userContext = {
      targetRole:      user.targetRole ?? 'Software Engineer',
      weakAreas,
      currentStreak:   user.currentStreak,
      firstName:       user.firstName ?? undefined,
    };

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    const res = await fetch(`${aiUrl}/coach`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messages:     dto.messages,
        user_context: userContext,
        stream:       false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => 'AI engine error');
      throw new Error(`AI coach failed (${res.status}): ${body}`);
    }

    return res.json();
  }
}
