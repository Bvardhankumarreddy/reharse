import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { SubmissionFingerprint } from '../entities/submission-fingerprint.entity';
import { Blocklist, BlockType } from '../entities/blocklist.entity';
import { TsAuditService } from '../services/ts-audit.service';

@Controller('admin/trust-safety')
@UseGuards(AdminGuard)
export class TrustSafetyAdminController {
  constructor(
    @InjectRepository(SubmissionFingerprint)
    private readonly fpRepo: Repository<SubmissionFingerprint>,
    @InjectRepository(Blocklist)
    private readonly blockRepo: Repository<Blocklist>,
    private readonly audit: TsAuditService,
  ) {}

  /**
   * Per-week overview: total submissions, unique IPs/devices, VPN count,
   * and a "suspicious IPs" list (≥3 submissions from same IP in the
   * lookback window).
   */
  @Get('quiz/:quizWeek/overview')
  async quizOverview(@Param('quizWeek') quizWeekStr: string) {
    const quizWeek = Math.round(Number(quizWeekStr));
    if (!Number.isFinite(quizWeek) || quizWeek < 1) {
      throw new BadRequestException('quizWeek must be a positive integer');
    }
    const rows = await this.fpRepo.find({
      where: { quizWeek, phase: 'submit' },
      order: { createdAt: 'ASC' },
    });

    const byIp = new Map<string, SubmissionFingerprint[]>();
    for (const r of rows) {
      if (!byIp.has(r.ipAddress)) byIp.set(r.ipAddress, []);
      byIp.get(r.ipAddress)!.push(r);
    }

    const suspiciousIps = Array.from(byIp.entries())
      .filter(([, fps]) => fps.length >= 3)
      .map(([ip, fps]) => ({
        ip,
        count: fps.length,
        city: fps[0].ipCity,
        country: fps[0].ipCountry,
        isVpn: fps.some((f) => f.isVpn),
        users: fps.map((f) => ({
          email: f.userEmail,
          name: f.userName,
          score: f.score,
          timeSeconds: f.totalTimeSeconds,
          submittedAt: f.createdAt,
        })),
      }))
      .sort((a, b) => b.count - a.count);

    const uniqueDevices = new Set(
      rows.map((r) => r.deviceFingerprint).filter((d): d is string => !!d),
    );

    return {
      quizWeek,
      totalSubmissions: rows.length,
      uniqueIps: byIp.size,
      uniqueDevices: uniqueDevices.size,
      vpnSubmissions: rows.filter((r) => r.isVpn).length,
      copyPasteDetected: rows.filter((r) => r.copyPasteDetected).length,
      heavyTabSwitching: rows.filter((r) => r.tabSwitchCount > 5).length,
      suspiciousIps,
    };
  }

  /**
   * Single-user investigation across all quizzes — flags account sharing
   * via multi-IP / multi-device patterns.
   */
  @Get('user/:email')
  async investigateUser(@Param('email') emailRaw: string) {
    const email = emailRaw.toLowerCase().trim();
    const rows = await this.fpRepo.find({
      where: { userEmail: email, phase: 'submit' },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) throw new NotFoundException('No submissions for that email');

    const ips = Array.from(new Set(rows.map((r) => r.ipAddress)));
    const devices = Array.from(new Set(
      rows.map((r) => r.deviceFingerprint).filter((d): d is string => !!d),
    ));
    const weeks = Array.from(new Set(rows.map((r) => r.quizWeek))).sort((a, b) => a - b);

    return {
      email,
      totalSubmissions: rows.length,
      quizzesPlayed: weeks,
      uniqueIps: ips,
      uniqueDevices: devices,
      multiIpFlag: ips.length > 1,
      multiDeviceFlag: devices.length > 1,
      submissions: rows.map((r) => ({
        id: r.id,
        quizWeek: r.quizWeek,
        ipAddress: r.ipAddress,
        ipCity: r.ipCity,
        deviceFingerprint: r.deviceFingerprint,
        score: r.score,
        timeSeconds: r.totalTimeSeconds,
        tabSwitches: r.tabSwitchCount,
        copyPaste: r.copyPasteDetected,
        isVpn: r.isVpn,
        submittedAt: r.createdAt,
      })),
    };
  }

  /**
   * Single-IP investigation — who all played from this IP, across which
   * quizzes. Use for cafe/office triage or to vet a flagged "suspicious IP".
   */
  @Get('ip/:ip')
  async investigateIp(@Param('ip') ip: string) {
    const rows = await this.fpRepo.find({
      where: { ipAddress: ip, phase: 'submit' },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) throw new NotFoundException('No submissions from that IP');

    const users = Array.from(new Set(rows.map((r) => r.userEmail)));
    const weeks = Array.from(new Set(rows.map((r) => r.quizWeek))).sort((a, b) => a - b);

    return {
      ip,
      city: rows[0].ipCity,
      country: rows[0].ipCountry,
      isVpn: rows.some((r) => r.isVpn),
      totalSubmissions: rows.length,
      uniqueUsers: users,
      quizzesPlayed: weeks,
      submissions: rows.map((r) => ({
        id: r.id, quizWeek: r.quizWeek, userEmail: r.userEmail, userName: r.userName,
        score: r.score, timeSeconds: r.totalTimeSeconds, submittedAt: r.createdAt,
      })),
    };
  }

  @Get('blocklist')
  list() {
    return this.blockRepo.find({ order: { blockedAt: 'DESC' } });
  }

  @Post('block')
  async addBlock(@Body() body: {
    blockType?: string; blockValue?: string; reason?: string;
    blockedBy?: string; permanent?: boolean; expiresAt?: string;
  }) {
    const blockType = body?.blockType as BlockType | undefined;
    if (!blockType || !['email', 'ip', 'device'].includes(blockType)) {
      throw new BadRequestException("blockType must be 'email' | 'ip' | 'device'");
    }
    if (!body?.blockValue?.trim()) throw new BadRequestException('blockValue is required');

    const row = await this.blockRepo.save(this.blockRepo.create({
      blockType,
      blockValue: blockType === 'email'
        ? body.blockValue.toLowerCase().trim()
        : body.blockValue.trim(),
      reason: body.reason ?? null,
      blockedBy: body.blockedBy ?? null,
      permanent: body.permanent === true,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    }));
    await this.audit.log({
      action: 'blocklist.add',
      actor: body.blockedBy ?? null,
      targetType: blockType, targetId: row.id,
      details: { blockType, blockValue: row.blockValue, reason: row.reason },
    });
    return row;
  }

  @Delete('block/:id')
  async deleteBlock(@Param('id') id: string) {
    const row = await this.blockRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Block not found');
    await this.blockRepo.delete(id);
    await this.audit.log({
      action: 'blocklist.remove',
      targetType: row.blockType, targetId: id,
      details: { blockType: row.blockType, blockValue: row.blockValue },
    });
    return { ok: true };
  }

  /** Audit log timeline — optional date range + action filter. */
  @Get('audit')
  async auditList(
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitQ?: string,
  ) {
    const limit = Math.max(1, Math.min(500, Number(limitQ) || 100));
    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (from || to) {
      const a = from ? new Date(from) : new Date(0);
      const b = to ? new Date(to) : new Date();
      where.createdAt = Between(a, b);
    }
    return this.fpRepo.manager.find('TsAuditLog' as never, {
      where, order: { createdAt: 'DESC' }, take: limit,
    } as never);
  }
}
