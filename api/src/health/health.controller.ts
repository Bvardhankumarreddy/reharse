import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get()
  async check() {
    const dbOk = this.db.isInitialized;
    return {
      status:  dbOk ? 'ok' : 'degraded',
      db:      dbOk ? 'connected' : 'disconnected',
      ts:      new Date().toISOString(),
    };
  }
}
