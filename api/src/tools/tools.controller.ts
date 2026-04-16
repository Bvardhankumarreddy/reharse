import { Controller, Post, Get, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';

class AnalyzeJDDto {
  @IsString()
  jobDescription: string;

  @IsOptional()
  @IsString()
  resumeText?: string;
}

class FetchJDDto {
  @IsUrl()
  url: string;
}

@ApiTags('tools')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('tools')
export class ToolsController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** GET /api/v1/tools/warmup — wake up the AI engine before an interview starts */
  @Get('warmup')
  async warmup() {
    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    try {
      await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(5_000) });
    } catch {
      // Non-fatal — warmup is best-effort
    }
    return { ok: true };
  }

  /**
   * POST /api/v1/tools/jd-fetch — fetch a career/job page URL and return its text content.
   * Runs server-side to avoid CORS; strips all HTML tags before returning.
   */
  @Post('jd-fetch')
  async fetchJD(@Body() dto: FetchJDDto) {
    let html: string;
    try {
      const res = await fetch(dto.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Rehearse/1.0)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new BadRequestException(`Could not fetch URL (HTTP ${res.status})`);
      html = await res.text();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Failed to load the URL: ${(err as Error).message}`);
    }

    // Strip all HTML tags and collapse whitespace
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\s{2,}/g, '\n')
      .trim();

    if (text.length < 100) {
      throw new BadRequestException('Page content too short — try pasting the job description directly.');
    }

    // Cap at ~8000 chars to stay within token budget
    return { text: text.slice(0, 8_000) };
  }

  /** GET /api/v1/tools/jd-match/usage — current week usage for the free tier counter */
  @Get('jd-match/usage')
  getJDMatchUsage(@CurrentUser() clerkUser: ClerkUser) {
    return this.users.getJDMatchUsage(clerkUser.sub);
  }

  /** POST /api/v1/tools/jd-match — analyse a JD against the user's stored resume */
  @Post('jd-match')
  async analyzeJD(
    @CurrentUser() clerkUser: ClerkUser,
    @Body() dto: AnalyzeJDDto,
  ) {
    // Enforce free-tier weekly limit before hitting the AI engine
    await this.users.checkAndIncrementJDMatch(clerkUser.sub);

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';

    // Use caller-supplied resume text; fall back to profile resume
    let resumeText = dto.resumeText ?? null;
    if (!resumeText) {
      try {
        const user = await this.users.findById(clerkUser.sub);
        resumeText = user.resumeText ?? null;
      } catch { /* non-fatal */ }
    }

    const res = await fetch(`${aiUrl}/jd-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_description: dto.jobDescription,
        resume_text:     resumeText,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => 'AI engine error');
      throw new Error(`JD match failed (${res.status}): ${body}`);
    }

    return res.json();
  }

  /** POST /api/v1/tools/resume-review — get AI feedback on user's resume */
  @Post('resume-review')
  async reviewResume(@CurrentUser() clerkUser: ClerkUser) {
    const user = await this.users.findById(clerkUser.sub);
    if (!user.resumeText) {
      throw new BadRequestException('No resume found. Please upload a resume first in Settings.');
    }

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';

    const res = await fetch(`${aiUrl}/resume/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume_text: user.resumeText,
        target_role: user.targetRole ?? null,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => 'AI engine error');
      throw new Error(`Resume review failed (${res.status}): ${body}`);
    }

    return res.json();
  }
}
