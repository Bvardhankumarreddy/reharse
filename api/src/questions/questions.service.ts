import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Question } from './question.entity';
import type { QuestionFilterDto } from './dto/question-filter.dto';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private readonly repo: Repository<Question>,
  ) {}

  async findAll(filter: QuestionFilterDto): Promise<{ data: Question[]; total: number }> {
    const qb = this.repo.createQueryBuilder('q').where('q.isActive = true');

    if (filter.type)       qb.andWhere('q.type = :type', { type: filter.type });
    if (filter.difficulty) qb.andWhere('q.difficulty = :diff', { diff: filter.difficulty });
    if (filter.company)    qb.andWhere(':company = ANY(string_to_array(q.companies, \',\'))', { company: filter.company });
    if (filter.role)       qb.andWhere(':role = ANY(string_to_array(q.roles, \',\'))', { role: filter.role });
    if (filter.search) {
      qb.andWhere('q.question ILIKE :search', { search: `%${filter.search}%` });
    }

    qb.orderBy('q.createdAt', 'DESC')
      .skip(filter.offset ?? 0)
      .take(filter.limit ?? 20);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Question> {
    const q = await this.repo.findOne({ where: { id, isActive: true } });
    if (!q) throw new NotFoundException(`Question ${id} not found`);
    return q;
  }

  async recordAttempt(id: string, score: number): Promise<void> {
    const q = await this.findOne(id);
    const newCount = q.attemptCount + 1;
    const newAvg   = ((q.avgScore * q.attemptCount) + score) / newCount;
    await this.repo.update(id, { attemptCount: newCount, avgScore: Math.round(newAvg) });
  }
}
