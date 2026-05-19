import {
  Controller, Get, Post, Param, Query, Body, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../auth/admin.guard';
import { Brand } from './entities/brand.entity';
import { BrandMemory } from './entities/brand-memory.entity';
import { WeeklyContentPlan } from './entities/weekly-content-plan.entity';
import { AgentRun } from './entities/agent-run.entity';
import { StrategyAgent } from './agents/strategy.agent';

@Controller('admin/content-studio')
@UseGuards(AdminGuard)
export class ContentStudioController {
  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(BrandMemory) private readonly memoryRepo: Repository<BrandMemory>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(AgentRun) private readonly runRepo: Repository<AgentRun>,
    private readonly strategy: StrategyAgent,
  ) {}

  @Get('brands')
  async brands() {
    const data = await this.brandRepo.find({ order: { createdAt: 'ASC' } });
    return { data, count: data.length };
  }

  @Get('brands/:id/memories')
  memories(@Param('id') id: string) {
    return this.memoryRepo.find({
      where: { brandId: id },
      order: { weight: 'DESC' },
    });
  }

  @Get('plans')
  async plans(@Query('brandId') brandId?: string) {
    const qb = this.planRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.lessons', 'l')
      .orderBy('p."weekOf"', 'DESC')
      .limit(100);
    if (brandId) qb.where('p."brandId" = :brandId', { brandId });
    const data = await qb.getMany();
    return {
      data: data.map((p) => ({
        ...p,
        lessonCount: p.lessons?.length ?? 0,
      })),
      count: data.length,
    };
  }

  /** Slice 1: Strategy Agent → week plan + 2 lessons. */
  @Post('plans/generate')
  generate(@Body() body: { brandId?: string; weekOf?: string }) {
    if (!body?.brandId) throw new BadRequestException('brandId is required');
    return this.strategy.generateWeek(body.brandId, body.weekOf);
  }

  @Get('plans/:id')
  async plan(@Param('id') id: string) {
    const plan = await this.planRepo.findOne({
      where: { id },
      relations: ['lessons'],
    });
    if (!plan) throw new NotFoundException('Plan not found');
    plan.lessons?.sort((a, b) => a.lessonNumber - b.lessonNumber);
    const agentRuns = await this.runRepo.find({
      where: { planId: id },
      order: { createdAt: 'ASC' },
    });
    return { ...plan, agentRuns };
  }
}
