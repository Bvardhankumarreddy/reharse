import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [ToolsController],
})
export class ToolsModule {}
