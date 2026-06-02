import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SubmissionFingerprint } from '../entities/submission-fingerprint.entity';
import { Blocklist } from '../entities/blocklist.entity';
import { GeolocationService } from './geolocation.service';

export interface StartCaptureInput {
  quizWeek: number;
  email: string;
  name?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
  browserId?: string | null;
  screenResolution?: string | null;
  sessionId?: string | null;
}

export interface SubmitCaptureInput extends StartCaptureInput {
  submissionId: string;
  totalTimeSeconds: number;
  score: number;
  questionIds: string[];
  answerTimesSeconds?: number[];
  tabSwitchCount?: number;
  copyPasteDetected?: boolean;
}

export interface BlockHit {
  matched: true;
  blockType: 'email' | 'ip' | 'device';
  blockValue: string;
  reason: string | null;
}

@Injectable()
export class FingerprintService {
  private readonly logger = new Logger(FingerprintService.name);

  constructor(
    @InjectRepository(SubmissionFingerprint)
    private readonly fpRepo: Repository<SubmissionFingerprint>,
    @InjectRepository(Blocklist)
    private readonly blockRepo: Repository<Blocklist>,
    private readonly geo: GeolocationService,
    private readonly config: ConfigService,
  ) {}

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Check whether this submitter is on the blocklist. Returns null when
   * clear, or a {matched, blockType, blockValue, reason} object otherwise.
   * Inactive/expired blocks are ignored at the query level.
   */
  async checkBlocklist(
    email: string, ip: string, device?: string | null,
  ): Promise<BlockHit | null> {
    const candidates: Array<{ blockType: 'email' | 'ip' | 'device'; blockValue: string }> = [
      { blockType: 'email', blockValue: email.toLowerCase().trim() },
      { blockType: 'ip',    blockValue: ip },
    ];
    if (device) candidates.push({ blockType: 'device', blockValue: device });

    const now = new Date();
    for (const c of candidates) {
      const row = await this.blockRepo.findOne({ where: c });
      if (!row) continue;
      if (!row.permanent && row.expiresAt && row.expiresAt < now) continue;
      return {
        matched: true,
        blockType: c.blockType,
        blockValue: c.blockValue,
        reason: row.reason,
      };
    }
    return null;
  }

  /**
   * Write a 'start' phase fingerprint row before any questions are picked.
   * Used to give the UniqueQuestionService a current geo snapshot without
   * needing to also call ip-api.com again.
   */
  async captureAtStart(opts: StartCaptureInput): Promise<SubmissionFingerprint | null> {
    if (!this.config.get<boolean>('trustSafety.captureFingerprints')) return null;
    try {
      const g = await this.geo.lookup(opts.ipAddress);
      return await this.fpRepo.save(this.fpRepo.create({
        submissionId: null,
        sessionId: opts.sessionId ?? null,
        quizWeek: opts.quizWeek,
        userEmail: opts.email.toLowerCase().trim(),
        userName: opts.name ?? null,
        ipAddress: opts.ipAddress,
        ipCountry: g.country, ipRegion: g.region, ipCity: g.city,
        ipLatitude:  g.latitude  === null ? null : String(g.latitude),
        ipLongitude: g.longitude === null ? null : String(g.longitude),
        isVpn: g.isVpn,
        userAgent: opts.userAgent ?? null,
        deviceFingerprint: opts.deviceFingerprint ?? null,
        browserId: opts.browserId ?? null,
        screenResolution: opts.screenResolution ?? null,
        questionIds: [],
        phase: 'start',
      }));
    } catch (e) {
      this.logger.error(`captureAtStart failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Write the final 'submit' phase fingerprint after the quiz is done.
   * Idempotent on submission_id — replaces any prior submit row for the
   * same submission (defensive, mostly for retries).
   */
  async captureAtSubmit(opts: SubmitCaptureInput): Promise<SubmissionFingerprint | null> {
    if (!this.config.get<boolean>('trustSafety.captureFingerprints')) return null;
    try {
      const g = await this.geo.lookup(opts.ipAddress);

      const qCount = opts.questionIds.length;
      const avg = qCount > 0 ? opts.totalTimeSeconds / qCount : 0;
      const fastest = (opts.answerTimesSeconds ?? []).length
        ? Math.max(0, Math.min(...opts.answerTimesSeconds!))
        : null;

      // Replace any prior submit row for this submission (idempotent).
      await this.fpRepo.delete({ submissionId: opts.submissionId, phase: 'submit' });

      return await this.fpRepo.save(this.fpRepo.create({
        submissionId: opts.submissionId,
        sessionId: opts.sessionId ?? null,
        quizWeek: opts.quizWeek,
        userEmail: opts.email.toLowerCase().trim(),
        userName: opts.name ?? null,
        ipAddress: opts.ipAddress,
        ipCountry: g.country, ipRegion: g.region, ipCity: g.city,
        ipLatitude:  g.latitude  === null ? null : String(g.latitude),
        ipLongitude: g.longitude === null ? null : String(g.longitude),
        isVpn: g.isVpn,
        userAgent: opts.userAgent ?? null,
        deviceFingerprint: opts.deviceFingerprint ?? null,
        browserId: opts.browserId ?? null,
        screenResolution: opts.screenResolution ?? null,
        totalTimeSeconds: opts.totalTimeSeconds,
        score: opts.score,
        questionIds: opts.questionIds,
        avgTimePerQuestionSeconds: String(Number(avg.toFixed(2))),
        fastestAnswerSeconds: fastest,
        tabSwitchCount: opts.tabSwitchCount ?? 0,
        copyPasteDetected: opts.copyPasteDetected ?? false,
        phase: 'submit',
      }));
    } catch (e) {
      this.logger.error(`captureAtSubmit failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Nearby = same exact IP, OR within `radiusKm` of the lookup geo, in
   * the last `lookbackHours`. Looks at 'submit' rows only — 'start' rows
   * for in-progress sessions don't count (their question_ids are empty).
   */
  async findNearby(
    quizWeek: number, ipAddress: string,
    geo: { latitude: number | null; longitude: number | null },
  ): Promise<SubmissionFingerprint[]> {
    const lookbackHours = Number(this.config.get('trustSafety.nearby.lookbackHours') ?? 24);
    const radiusKm = Number(this.config.get('trustSafety.nearby.radiusKm') ?? 10);
    const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    const sameIp = await this.fpRepo.find({
      where: {
        quizWeek, ipAddress, phase: 'submit',
        createdAt: MoreThan(cutoff),
      },
      order: { createdAt: 'DESC' },
    });

    let nearbyGeo: SubmissionFingerprint[] = [];
    if (geo.latitude !== null && geo.longitude !== null) {
      const recent = await this.fpRepo.find({
        where: { quizWeek, phase: 'submit', createdAt: MoreThan(cutoff) },
        order: { createdAt: 'DESC' },
      });
      nearbyGeo = recent.filter((fp) => {
        if (fp.ipAddress === ipAddress) return false;
        const lat = fp.ipLatitude === null ? null : Number(fp.ipLatitude);
        const lon = fp.ipLongitude === null ? null : Number(fp.ipLongitude);
        return this.geo.isWithinRadiusKm(geo.latitude, geo.longitude, lat, lon, radiusKm);
      });
    }

    // Dedupe by id, keep the most recent first.
    const map = new Map<string, SubmissionFingerprint>();
    for (const r of [...sameIp, ...nearbyGeo]) map.set(r.id, r);
    return Array.from(map.values());
  }
}
