import {
  Body, Controller, Get, Post, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../../auth/admin.guard';
import { CronGateService } from '../services/cron-gate.service';

@Controller('admin/system')
@UseGuards(AdminGuard)
export class SystemController {
  constructor(private readonly gate: CronGateService) {}

  /** Current pause flag + who last flipped it. */
  @Get('cron-status')
  async cronStatus() {
    return this.gate.status();
  }

  /**
   * Flip the global cron kill-switch. Manual admin actions (regen,
   * generate scenes, publish) are unaffected — only scheduled repeaters
   * idle out.
   */
  @Post('cron-status')
  async setCronStatus(
    @Body() body: { paused: boolean },
    @Req() req: Request,
  ) {
    const actor = (req as Request & { admin?: { email?: string } }).admin?.email ?? null;
    await this.gate.setPaused(Boolean(body.paused), actor);
    return this.gate.status();
  }
}
