import {
  Controller, Get, Patch, Param, Query, Body, UseGuards, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { Topic, TopicStatus } from '../entities/topic.entity';

@Controller('admin/ai-squad/topics')
@UseGuards(AdminGuard)
export class TopicsController {
  constructor(
    @InjectRepository(Topic) private readonly topicRepo: Repository<Topic>,
  ) {}

  @Get()
  async list(
    @Query('status') status?: TopicStatus,
    @Query('themeId') themeId?: string,
  ) {
    const qb = this.topicRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.theme', 'theme')
      .orderBy('t.createdAt', 'DESC')
      .limit(200);
    if (status) qb.andWhere('t.status = :status', { status });
    if (themeId) qb.andWhere('t."themeId" = :themeId', { themeId });
    const data = await qb.getMany();
    return { data, count: data.length };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const topic = await this.topicRepo.findOne({
      where: { id },
      relations: ['theme'],
    });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<Pick<Topic,
      'title' | 'description' | 'angle' | 'topicType' | 'recommendedCharacters' |
      'difficulty' | 'format' | 'keyConcepts' | 'status' | 'scheduledFor' | 'notes'
    >>,
  ) {
    const topic = await this.topicRepo.findOne({ where: { id } });
    if (!topic) throw new NotFoundException('Topic not found');
    await this.topicRepo.update(id, body);
    return this.topicRepo.findOne({ where: { id } });
  }
}
