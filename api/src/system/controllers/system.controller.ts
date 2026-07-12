import {
  BadRequestException,
  Body, Controller, Get, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../../auth/admin.guard';
import { CronGateService } from '../services/cron-gate.service';

@Controller('admin/system')
@UseGuards(AdminGuard)
export class SystemController {
  constructor(private readonly gate: CronGateService) {}

  /**
   * Full status list joined against the CRON_REGISTRY. One row per cron,
   * grouped in the UI by module. Rows missing from the DB default to
   * paused=false (untouched crons run).
   */
  @Get('crons')
  async listCrons() {
    return this.gate.listStatus();
  }

  /** Flip an individual cron's pause flag. */
  @Post('crons/:key/pause')
  async pauseOne(
    @Param('key') key: string,
    @Body() body: { paused: boolean },
    @Req() req: Request,
  ) {
    if (typeof body?.paused !== 'boolean') {
      throw new BadRequestException('body.paused (boolean) is required');
    }
    const actor = (req as Request & { admin?: { email?: string } }).admin?.email ?? null;
    await this.gate.setPaused(key, body.paused, actor);
    return this.gate.listStatus();
  }
}
