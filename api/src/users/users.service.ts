import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import type { ClerkUser } from '../auth/current-user.decorator';
import type { UpdateUserDto } from './dto/update-user.dto';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly storage: StorageService,
  ) {}

  /** Upsert from Clerk JWT claims — called on every authenticated request */
  async upsert(clerkUser: ClerkUser): Promise<User> {
    let user = await this.repo.findOne({ where: { id: clerkUser.sub } });
    if (!user) {
      user = this.repo.create({
        id:        clerkUser.sub,
        // Fall back to a unique placeholder so the UNIQUE constraint never fires
        // even when Clerk's JWT template omits the email claim.
        email:     clerkUser.email ?? `${clerkUser.sub}@clerk.local`,
        firstName: clerkUser.firstName,
        lastName:  clerkUser.lastName,
        imageUrl:  clerkUser.imageUrl,
      });
    } else {
      // Sync profile fields from Clerk on every login
      // Only overwrite email when Clerk actually provides one (don't replace a real
      // email with the placeholder if the claim disappears from the token).
      if (clerkUser.email) user.email = clerkUser.email;
      user.firstName = clerkUser.firstName ?? user.firstName;
      user.lastName  = clerkUser.lastName  ?? user.lastName;
      user.imageUrl  = clerkUser.imageUrl  ?? user.imageUrl;
    }
    return this.repo.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    // Shallow-merge JSON columns so partial updates don't wipe unrelated keys
    const { preferences, notificationPreferences, ...scalar } = dto;
    Object.assign(user, scalar);
    if (preferences !== undefined) {
      user.preferences = { ...(user.preferences ?? {}), ...preferences } as typeof user.preferences;
    }
    if (notificationPreferences !== undefined) {
      user.notificationPreferences = { ...(user.notificationPreferences ?? {}), ...notificationPreferences };
    }
    return this.repo.save(user);
  }

  async parseAndSaveResume(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    aiUrl: string,
  ): Promise<User> {
    // Fetch user first so we can include their name in the S3 folder
    const user = await this.findById(id);

    const isPro = user.subscriptionTier === 'pro' &&
      (user.subscriptionStatus === 'active' ||
        (user.subscriptionStatus === 'day_pass' &&
          (!user.subscriptionEndsAt || user.subscriptionEndsAt > new Date())));

    // Free users: max 1 resume upload
    if (!isPro && (user.resumeVersions?.length ?? 0) >= 1) {
      throw new ForbiddenException(
        'Free accounts support 1 resume upload. Upgrade to Pro to upload multiple resumes and keep version history.',
      );
    }

    // Run S3 upload and AI parsing in parallel
    const s3Key = this.storage.isConfigured()
      ? StorageService.resumeKey(id, file.originalname, user.firstName, user.lastName)
      : null;

    const [, aiRes] = await Promise.all([
      s3Key
        ? this.storage.upload(s3Key, file.buffer, file.mimetype)
        : Promise.resolve(),
      (async () => {
        const form = new FormData();
        form.append(
          'file',
          new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
          file.originalname,
        );
        const res = await fetch(`${aiUrl}/resume/parse`, { method: 'POST', body: form });
        if (!res.ok) {
          const body = await res.text().catch(() => 'AI engine error');
          throw new Error(`Resume parse failed (${res.status}): ${body}`);
        }
        return res.json() as Promise<{
          raw_text?:         string;
          target_role?:      string;
          experience_level?: string;
        }>;
      })(),
    ]);

    // Determine the next version number
    const history     = user.resumeVersions ?? [];
    const nextVersion = history.length > 0 ? history[0].version + 1 : 1;

    if (aiRes.raw_text)          user.resumeText      = aiRes.raw_text;
    if (aiRes.target_role)       user.targetRole      = aiRes.target_role;
    if (aiRes.experience_level)  user.experienceLevel = aiRes.experience_level;

    if (s3Key) {
      // Prepend new version to history (newest first), keep up to 10 versions
      const newEntry = {
        key:        s3Key,
        fileName:   file.originalname,
        uploadedAt: new Date().toISOString(),
        version:    nextVersion,
      };
      user.resumeVersions = [newEntry, ...history].slice(0, isPro ? 10 : 1);
      user.resumeUrl      = s3Key;
    } else {
      // No S3 — fall back to filename only, no versioning
      user.resumeUrl = file.originalname;
    }

    return this.repo.save(user);
  }

  /** Return the version history for a user's resumes. */
  async getResumeVersions(id: string) {
    const user = await this.findById(id);
    return user.resumeVersions ?? [];
  }

  /** Generate a short-lived presigned URL for any resume version (defaults to latest). */
  async getResumeDownloadUrl(id: string, s3Key?: string): Promise<string> {
    const user = await this.findById(id);

    // Resolve which key to use
    const key = s3Key ?? user.resumeUrl;
    if (!key) throw new NotFoundException('No resume on file');
    if (!key.startsWith('resumes/')) throw new NotFoundException('Resume file not stored in S3');

    // Security: key must exist in this user's version history (DB-backed ownership check)
    const versions = user.resumeVersions ?? [];
    const owned = key === user.resumeUrl || versions.some((v) => v.key === key);
    if (!owned) throw new NotFoundException('Resume not found');

    return this.storage.getPresignedUrl(key);
  }

  // ── JD Match usage (server-side free-tier enforcement) ──────────────────────

  private static readonly FREE_JD_WEEKLY_LIMIT = 3;

  private static jdWeekKey(): string {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
  }

  async getJDMatchUsage(id: string) {
    const user = await this.findById(id);
    const isPro = user.subscriptionTier === 'pro' &&
      (user.subscriptionStatus === 'active' ||
        (user.subscriptionStatus === 'day_pass' &&
          (!user.subscriptionEndsAt || user.subscriptionEndsAt > new Date())));
    const weekKey = UsersService.jdWeekKey();
    const usesThisWeek = user.jdMatchWeekKey === weekKey ? (user.jdMatchUsesWeek ?? 0) : 0;
    return { usesThisWeek, weekLimit: UsersService.FREE_JD_WEEKLY_LIMIT, isPro };
  }

  /** Throws ForbiddenException if free user is over the weekly limit, then increments the counter. */
  async checkAndIncrementJDMatch(id: string): Promise<void> {
    const user = await this.findById(id);
    const isPro = user.subscriptionTier === 'pro' &&
      (user.subscriptionStatus === 'active' ||
        (user.subscriptionStatus === 'day_pass' &&
          (!user.subscriptionEndsAt || user.subscriptionEndsAt > new Date())));
    if (isPro) return;

    const weekKey = UsersService.jdWeekKey();
    const count = user.jdMatchWeekKey === weekKey ? (user.jdMatchUsesWeek ?? 0) : 0;
    if (count >= UsersService.FREE_JD_WEEKLY_LIMIT) {
      throw new ForbiddenException(
        `Free accounts get ${UsersService.FREE_JD_WEEKLY_LIMIT} JD analyses per week. Upgrade to Pro for unlimited access.`,
      );
    }
    user.jdMatchWeekKey  = weekKey;
    user.jdMatchUsesWeek = count + 1;
    await this.repo.save(user);
  }

  async updateStreak(id: string): Promise<User> {
    const user = await this.findById(id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const last = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
    if (last) last.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (!last || last < yesterday) {
      user.currentStreak = 1;
    } else if (last.getTime() === yesterday.getTime()) {
      user.currentStreak += 1;
    }
    // Same day — no change

    user.longestStreak  = Math.max(user.longestStreak, user.currentStreak);
    user.lastActiveDate = today;
    return this.repo.save(user);
  }
}
