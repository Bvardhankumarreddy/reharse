import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './feedback.entity';
import { SessionsService } from '../sessions/sessions.service';
import type { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly repo: Repository<Feedback>,
    private readonly sessions: SessionsService,
  ) {}

  async create(dto: CreateFeedbackDto, requestingUserId: string): Promise<Feedback> {
    // Verify session ownership
    await this.sessions.findOne(dto.sessionId, requestingUserId);

    const existing = await this.repo.findOne({ where: { sessionId: dto.sessionId } });
    if (existing) throw new ConflictException('Feedback already exists for this session');

    const feedback = this.repo.create({
      sessionId:       dto.sessionId,
      overallScore:    dto.overallScore,
      dimensionScores: dto.dimensionScores,
      summary:         dto.summary,
      questionFeedback: dto.questionFeedback as Feedback['questionFeedback'],
      nextSteps:       dto.nextSteps as Feedback['nextSteps'],
      weakAreas:       dto.weakAreas,
      modelUsed:       dto.modelUsed,
    });

    const saved = await this.repo.save(feedback);

    // Sync overallScore back to session
    await this.sessions.update(dto.sessionId, requestingUserId, {
      overallScore: dto.overallScore,
      status: 'completed',
    });

    return saved;
  }

  async findBySession(sessionId: string, userId: string): Promise<Feedback> {
    // Verify ownership
    await this.sessions.findOne(sessionId, userId);

    const feedback = await this.repo.findOne({ where: { sessionId } });
    if (!feedback) throw new NotFoundException(`No feedback for session ${sessionId}`);
    return feedback;
  }

  async findByUser(userId: string): Promise<Feedback[]> {
    return this.repo
      .createQueryBuilder('f')
      .innerJoin('f.session', 's', 's.userId = :userId', { userId })
      .orderBy('f.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Aggregates the last 5 sessions into a compact history object
   * that the AI engine uses to personalise question generation and evaluation.
   */
  async getUserAIHistory(userId: string): Promise<{
    recentScores:             number[];
    weakAreas:                string[];
    recurringFeedback:        string[];
    sessionsCompleted:        number;
    averageScore:             number | null;
    previouslyAskedQuestions: string[];
  }> {
    const recent = await this.repo
      .createQueryBuilder('f')
      .innerJoin('f.session', 's', 's.userId = :userId', { userId })
      .orderBy('f.createdAt', 'DESC')
      .take(10)
      .select(['f.overallScore', 'f.weakAreas', 'f.questionFeedback'])
      .getMany();

    const recentScores = recent
      .map(f => f.overallScore)
      .filter((s): s is number => s != null);

    // Rank weak areas by frequency across sessions
    const weakAreaCounts = new Map<string, number>();
    for (const f of recent) {
      for (const area of f.weakAreas ?? []) {
        weakAreaCounts.set(area, (weakAreaCounts.get(area) ?? 0) + 1);
      }
    }
    const weakAreas = [...weakAreaCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([area]) => area);

    // Surface improvement suggestions repeated in 2+ sessions
    const improvCounts = new Map<string, number>();
    for (const f of recent) {
      const seen = new Set<string>();
      for (const q of f.questionFeedback ?? []) {
        for (const imp of q.improvements ?? []) {
          const key = imp.slice(0, 80);
          if (!seen.has(key)) {
            seen.add(key);
            improvCounts.set(key, (improvCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }
    const recurringFeedback = [...improvCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([text]) => text);

    const averageScore = recentScores.length
      ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
      : null;

    // Collect unique question texts asked across the last 10 sessions (capped at 50)
    const seen = new Set<string>();
    const previouslyAskedQuestions: string[] = [];
    for (const f of recent) {
      for (const q of f.questionFeedback ?? []) {
        if (q.question && !seen.has(q.question)) {
          seen.add(q.question);
          previouslyAskedQuestions.push(q.question);
          if (previouslyAskedQuestions.length >= 50) break;
        }
      }
      if (previouslyAskedQuestions.length >= 50) break;
    }

    return { recentScores, weakAreas, recurringFeedback, sessionsCompleted: recent.length, averageScore, previouslyAskedQuestions };
  }

  async findById(id: string, userId: string): Promise<Feedback> {
    const feedback = await this.repo.findOne({
      where: { id },
      relations: ['session'],
    });
    if (!feedback) throw new NotFoundException(`Feedback ${id} not found`);
    if (feedback.session.userId !== userId) throw new ForbiddenException();
    return feedback;
  }
}
