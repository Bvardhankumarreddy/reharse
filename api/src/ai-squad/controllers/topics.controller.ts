import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { Topic, TopicStatus } from '../entities/topic.entity';
import { TopicGeneratorService } from '../services/topic-generator.service';

@Controller('admin/ai-squad/topics')
@UseGuards(AdminGuard)
export class TopicsController {
  constructor(
    @InjectRepository(Topic) private readonly topicRepo: Repository<Topic>,
    private readonly topicGen: TopicGeneratorService,
  ) {}

  /** Turn a freeform user idea into a structured topic ("Custom Ideas" theme). */
  @Post('custom')
  custom(@Body() body: { idea?: string; format?: 'long' | 'short' }) {
    if (!body.idea?.trim()) throw new BadRequestException('idea is required');
    if (body.format && body.format !== 'long' && body.format !== 'short') {
      throw new BadRequestException('format must be "long" or "short"');
    }
    return this.topicGen.createFromIdea(body.idea, body.format);
  }

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
