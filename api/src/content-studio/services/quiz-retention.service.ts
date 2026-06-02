import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { QuizSubmission, QuizSession } from '../../quiz/quiz.entities';
import { QuizBundle } from '../entities/quiz-bundle.entity';
import { QuizWinnerAnnouncement } from '../entities/quiz-winner-announcement.entity';

export interface RetentionPreview {
  /** Highest week number observed across submissions and bundles. */
  currentWeek: number;
  /** Delete everything with quizWeek/quizNumber ≤ this. 0 = nothing to delete. */
  threshold: number;
  weeksKept: number;
  counts: {
    submissions: number;
    sessions: number;
    bundles: number;
    winners: number;
  };
}

export interface RetentionResult extends RetentionPreview {
  deleted: {
    submissions: number;
    sessions: number;
    bundles: number;
    winners: number;
  };
}

/**
 * Weekly retention sweep — keeps the last N weeks of quiz user data + CS
 * quiz artifacts, deletes everything older.
 *
 * Cascade map (all enforced at the FK level):
 *   quiz_submission_answers     → quiz_submissions     (ON DELETE CASCADE)
 *   cs_quiz_bundle_questions    → cs_quiz_bundles      (ON DELETE CASCADE)
 *   cs_quiz_promo_packages      → cs_quiz_bundles      (ON DELETE CASCADE)
 *
 * So this service only needs to delete the four parent tables explicitly:
 *   1) quiz_submissions   (answers cascade)
 *   2) quiz_sessions      (standalone — server-side in-progress quiz state)
 *   3) cs_quiz_bundles    (questions + promo packages cascade)
 *   4) cs_quiz_winner_announcements (FK is on plan_id, not bundle —
 *      filter by its own quiz_number column)
 *
 * Content stays: cs_lessons / cs_weekly_content_plans / cs_content_assets
 * / cs_audit_logs / cs_agent_runs / cs_pipeline_runs / AQB tables.
 */
@Injectable()
export class QuizRetentionService {
  private readonly logger = new Logger(QuizRetentionService.name);

  constructor(
    @InjectRepository(QuizSubmission)
    private readonly submissionRepo: Repository<QuizSubmission>,
    @InjectRepository(QuizSession)
    private readonly sessionRepo: Repository<QuizSession>,
    @InjectRepository(QuizBundle)
    private readonly bundleRepo: Repository<QuizBundle>,
    @InjectRepository(QuizWinnerAnnouncement)
    private readonly winnerRepo: Repository<QuizWinnerAnnouncement>,
  ) {}

  /** Highest week number live in the system. 0 if nothing has been generated yet. */
  async currentMaxWeek(): Promise<number> {
    const [subMax, bunMax] = await Promise.all([
      this.submissionRepo
        .createQueryBuilder('s')
        .select('MAX(s."quizWeek")', 'm')
        .getRawOne<{ m: number | null }>(),
      this.bundleRepo
        .createQueryBuilder('b')
        .select('MAX(b."quiz_week")', 'm')
        .getRawOne<{ m: number | null }>(),
    ]);
    return Math.max(Number(subMax?.m ?? 0), Number(bunMax?.m ?? 0));
  }

  /** Compute counts of what WOULD be deleted, no writes. Safe to call from UI. */
  async preview(weeksKept = 3): Promise<RetentionPreview> {
    const currentWeek = await this.currentMaxWeek();
    // Need at least weeksKept+1 weeks of data before anything ages out.
    if (currentWeek < weeksKept + 1) {
      return {
        currentWeek, threshold: 0, weeksKept,
        counts: { submissions: 0, sessions: 0, bundles: 0, winners: 0 },
      };
    }
    const threshold = currentWeek - weeksKept;
    const [submissions, sessions, bundles, winners] = await Promise.all([
      this.submissionRepo.count({ where: { quizWeek: LessThanOrEqual(threshold) } }),
      this.sessionRepo.count({ where: { quizWeek: LessThanOrEqual(threshold) } }),
      this.bundleRepo.count({ where: { quizWeek: LessThanOrEqual(threshold) } }),
      this.winnerRepo.count({ where: { quizNumber: LessThanOrEqual(threshold) } }),
    ]);
    return {
      currentWeek, threshold, weeksKept,
      counts: { submissions, sessions, bundles, winners },
    };
  }

  /**
   * Delete everything where the week marker is ≤ currentMax - weeksKept.
   * Returns the same preview shape plus an `affected`-count per table.
   * No-ops when nothing's old enough.
   */
  async purgeOlderThan(weeksKept = 3): Promise<RetentionResult> {
    const pv = await this.preview(weeksKept);
    if (pv.threshold === 0) {
      this.logger.log(
        `Retention purge skipped — only ${pv.currentWeek} week(s) of data exist ` +
        `(need >${weeksKept} before anything ages out).`,
      );
      return {
        ...pv, deleted: { submissions: 0, sessions: 0, bundles: 0, winners: 0 },
      };
    }
    const t = pv.threshold;

    // Run deletes in parallel — they're across independent tables and the
    // FK cascades on the children fire per-row inside each delete.
    const [sub, sess, bun, win] = await Promise.all([
      this.submissionRepo.delete({ quizWeek: LessThanOrEqual(t) }),
      this.sessionRepo.delete({ quizWeek: LessThanOrEqual(t) }),
      this.bundleRepo.delete({ quizWeek: LessThanOrEqual(t) }),
      this.winnerRepo.delete({ quizNumber: LessThanOrEqual(t) }),
    ]);

    const deleted = {
      submissions: sub.affected ?? 0,
      sessions:    sess.affected ?? 0,
      bundles:     bun.affected ?? 0,
      winners:     win.affected ?? 0,
    };

    this.logger.warn(
      `Retention purge: kept weeks ${t + 1}..${pv.currentWeek}, deleted ≤ week ${t} — ` +
      `${deleted.submissions} submissions (+answers cascade), ` +
      `${deleted.sessions} sessions, ` +
      `${deleted.bundles} bundles (+questions/promos cascade), ` +
      `${deleted.winners} winner announcements`,
    );
    return { ...pv, deleted };
  }
}
