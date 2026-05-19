import {
  Controller, Get, Post, Param, Query, UseGuards, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { Theme } from '../entities/theme.entity';
import { Topic } from '../entities/topic.entity';
import { ThemeGeneratorService } from '../services/theme-generator.service';
import { TopicGeneratorService } from '../services/topic-generator.service';

@Controller('admin/ai-squad/themes')
@UseGuards(AdminGuard)
export class ThemesController {
  constructor(
    @InjectRepository(Theme) private readonly themeRepo: Repository<Theme>,
    @InjectRepository(Topic) private readonly topicRepo: Repository<Topic>,
    private readonly themeGen: ThemeGeneratorService,
    private readonly topicGen: TopicGeneratorService,
  ) {}

  @Post('generate')
  generate(@Query('count') count = '8') {
    return this.themeGen.generateThemes(Math.min(Number(count) || 8, 20));
  }

  @Get()
  async list(@Query('status') status?: string) {
    const where = status ? { status: status as Theme['status'] } : {};
    const data = await this.themeRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return { data, count: data.length };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const theme = await this.themeRepo.findOne({ where: { id } });
    if (!theme) throw new NotFoundException('Theme not found');
    const topics = await this.topicRepo.find({
      where: { themeId: id },
      order: { createdAt: 'ASC' },
    });
    return { theme, topics };
  }

  @Post(':id/topics/generate')
  generateTopics(@Param('id') id: string, @Query('count') count = '8') {
    return this.topicGen.generateTopicsForTheme(id, Math.min(Number(count) || 8, 20));
  }
}
