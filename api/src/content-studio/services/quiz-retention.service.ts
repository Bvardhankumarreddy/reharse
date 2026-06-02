import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { QuizSubmission, QuizSession } from '../../quiz/quiz.entities';
import { QuizBundle } from '../entities/quiz-bundle.entity';
import { QuizWinnerAnnouncement } from '../entities/quiz-winner-announcement.entity';
import { AuditService, AuditWriter } from './audit.service';
import { StorageService } from '../../storage/storage.service';

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
  /** S3 keys of the JSONL dumps, when archive=true. Empty when archive=false. */
  archive: {
    bucketUrlBase: string | null;   // null when archive=false or storage not configured
    keys: Record<'submissions' | 'sessions' | 'bundles' | 'winners', string | null>;
    archivedAt: string | null;
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
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Convert an array of rows to JSONL (one JSON object per line). */
  private toJsonl(rows: unknown[]): Buffer {
    const text = rows.map((r) => JSON.stringify(r)).join('\n');
    return Buffer.from(text + (text ? '\n' : ''), 'utf-8');
  }

  /**
   * Upload one table's rows to S3 and return the S3 key. Returns null and
   * logs a warning on upload failure — caller decides whether that's fatal.
   * Path: quiz-archive/week-{N}/{isoTimestamp}/{table}.jsonl
   */
  private async archiveTable(
    table: 'submissions' | 'sessions' | 'bundles' | 'winners',
    rows: unknown[],
    threshold: number,
    isoStamp: string,
  ): Promise<string | null> {
    if (rows.length === 0) return null;
    const key = `quiz-archive/week-${threshold}/${isoStamp}/${table}.jsonl`;
    try {
      const saved = await this.storage.upload(
        key, this.toJsonl(rows), 'application/x-ndjson',
      );
      this.logger.log(`[Retention] archived ${rows.length} ${table} → ${saved}`);
      return saved;
    } catch (e) {
      this.logger.error(
        `[Retention] failed to archive ${table} (${rows.length} rows): ${(e as Error).message}`,
      );
      return null;
    }
  }

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
   * Archive → delete everything where the week marker is ≤ currentMax - weeksKept.
   *
   * Flow per non-empty parent table:
   *   1. Load the rows that match the threshold (full row objects).
   *   2. Upload them as JSONL to S3 via StorageService.
   *   3. ONLY after upload succeeds, delete the rows. FK cascades then
   *      take child rows (submission_answers / bundle_questions /
   *      promo_packages) with them.
   *   4. If a table's upload fails, that table's rows are NOT deleted —
   *      they stay until the next sweep retries. Other tables continue.
   *
   * opts.archive = false skips the upload and goes straight to delete
   * (legacy behaviour). Default is true. With archive=true but storage
   * not configured, the call throws — better to fail loud than to drop
   * data the user thought was being archived.
   *
   * Writes to cs_audit_logs on every non-empty purge with the S3 keys.
   */
  async purgeOlderThan(
    weeksKept = 3,
    writer?: AuditWriter,
    opts: { archive?: boolean } = {},
  ): Promise<RetentionResult> {
    const archive = opts.archive !== false;  // default true
    if (archive && !this.storage.isConfigured()) {
      throw new BadRequestException(
        'STORAGE_LAMBDA_URL / STORAGE_LAMBDA_SECRET not set — cannot archive. ' +
        'Configure the storage Lambda, or pass archive=false to delete without archive.',
      );
    }

    const pv = await this.preview(weeksKept);
    if (pv.threshold === 0) {
      this.logger.log(
        `Retention purge skipped — only ${pv.currentWeek} week(s) of data exist ` +
        `(need >${weeksKept} before anything ages out).`,
      );
      return {
        ...pv,
        deleted: { submissions: 0, sessions: 0, bundles: 0, winners: 0 },
        archive: {
          bucketUrlBase: null,
          keys: { submissions: null, sessions: null, bundles: null, winners: null },
          archivedAt: null,
        },
      };
    }
    const t = pv.threshold;
    const isoStamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 1) Load the soon-to-be-deleted rows in parallel.
    const [subRows, sessRows, bunRows, winRows] = await Promise.all([
      this.submissionRepo.find({ where: { quizWeek: LessThanOrEqual(t) } }),
      this.sessionRepo.find({ where: { quizWeek: LessThanOrEqual(t) } }),
      this.bundleRepo.find({ where: { quizWeek: LessThanOrEqual(t) } }),
      this.winnerRepo.find({ where: { quizNumber: LessThanOrEqual(t) } }),
    ]);

    // 2) Archive — one S3 object per table.
    const keys: RetentionResult['archive']['keys'] = {
      submissions: null, sessions: null, bundles: null, winners: null,
    };
    if (archive) {
      const [kSub, kSess, kBun, kWin] = await Promise.all([
        this.archiveTable('submissions', subRows, t, isoStamp),
        this.archiveTable('sessions',    sessRows, t, isoStamp),
        this.archiveTable('bundles',     bunRows, t, isoStamp),
        this.archiveTable('winners',     winRows, t, isoStamp),
      ]);
      keys.submissions = kSub;
      keys.sessions    = kSess;
      keys.bundles     = kBun;
      keys.winners     = kWin;
    }

    // 3) Delete — but skip a table whose archive failed. Trades a slightly
    // bigger live DB for a guarantee that nothing's lost without a backup.
    const subDel = !archive || keys.submissions || subRows.length === 0
      ? await this.submissionRepo.delete({ quizWeek: LessThanOrEqual(t) })
      : { affected: 0 } as { affected: number };
    const sessDel = !archive || keys.sessions || sessRows.length === 0
      ? await this.sessionRepo.delete({ quizWeek: LessThanOrEqual(t) })
      : { affected: 0 } as { affected: number };
    const bunDel = !archive || keys.bundles || bunRows.length === 0
      ? await this.bundleRepo.delete({ quizWeek: LessThanOrEqual(t) })
      : { affected: 0 } as { affected: number };
    const winDel = !archive || keys.winners || winRows.length === 0
      ? await this.winnerRepo.delete({ quizNumber: LessThanOrEqual(t) })
      : { affected: 0 } as { affected: number };

    const deleted = {
      submissions: subDel.affected ?? 0,
      sessions:    sessDel.affected ?? 0,
      bundles:     bunDel.affected ?? 0,
      winners:     winDel.affected ?? 0,
    };

    const archived = {
      submissions: keys.submissions ? subRows.length : 0,
      sessions:    keys.sessions    ? sessRows.length : 0,
      bundles:     keys.bundles     ? bunRows.length : 0,
      winners:     keys.winners     ? winRows.length : 0,
    };

    this.logger.warn(
      `Retention purge: kept weeks ${t + 1}..${pv.currentWeek}, ` +
      `${archive ? 'archived-then-' : ''}deleted ≤ week ${t} — ` +
      `${deleted.submissions} subs (+answers cascade), ` +
      `${deleted.sessions} sess, ` +
      `${deleted.bundles} bundles (+questions/promos cascade), ` +
      `${deleted.winners} winners. ` +
      (archive ? `S3 keys: ${JSON.stringify(keys)}` : 'no archive'),
    );

    // Audit log — only when something actually got deleted.
    const total =
      deleted.submissions + deleted.sessions + deleted.bundles + deleted.winners;
    if (total > 0) {
      try {
        await this.audit.log({
          entityType: 'retention',
          entityId: null,
          action: 'deleted',
          before: { counts: pv.counts, threshold: t, currentWeek: pv.currentWeek, weeksKept },
          after: { deleted, archived, archiveKeys: archive ? keys : null },
          summary:
            `Retention ${archive ? 'archive→' : ''}purge — kept weeks ` +
            `${t + 1}..${pv.currentWeek}, wiped ≤ week ${t}: ` +
            `${deleted.submissions} subs, ${deleted.sessions} sess, ` +
            `${deleted.bundles} bundles, ${deleted.winners} winners ` +
            `(${total} rows total)` +
            (archive ? ` · archived to S3 (${isoStamp})` : ''),
          writer: writer ?? { userEmail: 'cron@retention-sweep' },
        });
      } catch (e) {
        this.logger.error(
          `Retention purge succeeded but audit log failed: ${(e as Error).message}`,
        );
      }
    }

    return {
      ...pv,
      deleted,
      archive: {
        bucketUrlBase: archive ? 's3://' : null,
        keys,
        archivedAt: archive ? new Date().toISOString() : null,
      },
    };
  }

  /**
   * Generate a presigned download URL for an archive JSONL key. Lets the
   * admin UI offer "📥 Download archive" buttons next to audit-log rows.
   * Returns null when storage isn't configured.
   */
  async presignArchive(key: string, expiresIn = 900): Promise<string | null> {
    if (!this.storage.isConfigured()) return null;
    return this.storage.getPresignedUrl(key, expiresIn);
  }
}
