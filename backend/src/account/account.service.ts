import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DataExportJob } from './entities/data-export-job.entity';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ExportCleanupResult {
  expired: number;
  failed: number;
  stuck: number;
  orphans: number;
}

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(DataExportJob)
    private readonly jobRepo: Repository<DataExportJob>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async requestExport(
    userId: string,
  ): Promise<{ jobId: string; status: string }> {
    const existing = await this.jobRepo.findOne({
      where: [
        { user_id: userId, status: 'pending' },
        { user_id: userId, status: 'processing' },
      ],
    });
    if (existing) {
      return { jobId: existing.id, status: existing.status };
    }

    const job = this.jobRepo.create({ user_id: userId });
    await this.jobRepo.save(job);
    return { jobId: job.id, status: job.status };
  }

  async getExportStatus(
    userId: string,
    jobId: string,
  ): Promise<{ jobId: string; status: string; expires_at: Date | null }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job || job.user_id !== userId) {
      throw new NotFoundException('Export job not found');
    }
    return { jobId: job.id, status: job.status, expires_at: job.expires_at };
  }

  async downloadExport(userId: string, jobId: string): Promise<string> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job || job.user_id !== userId) {
      throw new NotFoundException('Export job not found');
    }
    if (job.status !== 'ready' || !job.file_path) {
      throw new BadRequestException('Export is not ready yet');
    }
    if (job.expires_at && job.expires_at < new Date()) {
      throw new GoneException('Export has expired');
    }
    try {
      await fs.access(job.file_path);
    } catch {
      throw new GoneException('Export file is no longer available');
    }
    return job.file_path;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processExports(): Promise<void> {
    const jobs = await this.jobRepo.find({
      where: { status: 'pending' },
      take: 5,
    });
    for (const job of jobs) {
      await this.runExport(job).catch(() => {});
    }
  }

  private async runExport(job: DataExportJob): Promise<void> {
    await this.jobRepo.update(job.id, { status: 'processing' });
    try {
      const data = await this.gatherUserData(job.user_id);
      const dir = this.configService.get<string>('EXPORT_DIR', './exports');
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${job.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      const ttl = this.configService.get<number>('EXPORT_TTL_HOURS', 48);
      const expiresAt = new Date(Date.now() + ttl * 3_600_000);
      await this.jobRepo.update(job.id, {
        status: 'ready',
        file_path: filePath,
        expires_at: expiresAt,
      });
    } catch {
      await this.jobRepo.update(job.id, { status: 'failed' });
    }
  }

  /**
   * Related entity sections that must always be present in an export,
   * even when the user has no activity in that category.
   */
  static readonly EXPORT_SECTIONS = [
    'predictions',
    'markets_created',
    'notifications',
    'achievements',
    'bookmarks',
    'follows',
    'followers',
    'competitions',
    'leaderboard_history',
  ] as const;

  private async gatherUserData(
    userId: string,
  ): Promise<Record<string, unknown>> {
    const [profile] = await this.dataSource.query(
      `SELECT id, stellar_address, username, avatar_url, email, role,
              total_predictions, correct_predictions, reputation_score,
              season_points, created_at
       FROM users WHERE id = $1`,
      [userId],
    );
    if (!profile) throw new NotFoundException('User not found');

    const [
      predictions,
      markets,
      achievements,
      bookmarks,
      follows,
      followers,
      competitions,
      leaderboard,
      notifications,
    ] = await Promise.all([
      this.dataSource.query(`SELECT * FROM predictions WHERE "userId" = $1`, [
        userId,
      ]),
      this.dataSource.query(`SELECT * FROM markets WHERE "creatorId" = $1`, [
        userId,
      ]),
      this.dataSource.query(
        `SELECT * FROM user_achievements WHERE "userId" = $1`,
        [userId],
      ),
      this.dataSource.query(`SELECT * FROM user_bookmarks WHERE user_id = $1`, [
        userId,
      ]),
      this.dataSource.query(
        `SELECT * FROM user_follows WHERE follower_id = $1`,
        [userId],
      ),
      this.dataSource.query(
        `SELECT * FROM user_follows WHERE following_id = $1`,
        [userId],
      ),
      this.dataSource.query(
        `SELECT * FROM competition_participants WHERE user_id = $1`,
        [userId],
      ),
      this.dataSource.query(
        `SELECT * FROM leaderboard_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [userId],
      ),
      this.dataSource.query(
        `SELECT id, type, title, message, data, read, created_at
         FROM notifications WHERE user_address = $1 ORDER BY created_at DESC LIMIT 1000`,
        [profile.stellar_address],
      ),
    ]);

    return {
      exported_at: new Date().toISOString(),
      profile,
      predictions: predictions ?? [],
      markets_created: markets ?? [],
      notifications: notifications ?? [],
      achievements: achievements ?? [],
      bookmarks: bookmarks ?? [],
      follows: follows ?? [],
      followers: followers ?? [],
      competitions: competitions ?? [],
      leaderboard_history: leaderboard ?? [],
    };
  }

  async deleteAccount(userId: string): Promise<void> {
    const filePaths: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      const [user] = await manager.query(
        `SELECT stellar_address FROM users WHERE id = $1`,
        [userId],
      );
      if (!user) throw new NotFoundException('User not found');

      // Collect export file paths before deleting job rows
      const jobs: { file_path: string | null }[] = await manager.query(
        `SELECT file_path FROM data_export_jobs WHERE user_id = $1`,
        [userId],
      );
      for (const j of jobs) {
        if (j.file_path) filePaths.push(j.file_path);
      }

      // Delete address-indexed personal data
      await manager.query(`DELETE FROM notifications WHERE user_address = $1`, [
        user.stellar_address,
      ]);
      await manager.query(
        `DELETE FROM notification_digest_state WHERE user_id = $1`,
        [userId],
      );

      // Remove pending export records
      await manager.query(`DELETE FROM data_export_jobs WHERE user_id = $1`, [
        userId,
      ]);

      // Anonymize PII and soft-delete (sets deleted_at so JWT validate returns null)
      await manager.query(
        `UPDATE users
         SET email = NULL, username = NULL, avatar_url = NULL,
             ban_reason = NULL, banned_at = NULL, banned_by = NULL,
             deleted_at = NOW()
         WHERE id = $1`,
        [userId],
      );
    });

    // Remove export files from disk after the transaction commits
    for (const fp of filePaths) {
      await fs.unlink(fp).catch(() => {});
    }
  }

  /**
   * Removes stale export artifacts. Invoked on a configurable schedule by
   * {@link AccountExportCleanupScheduler}.
   *
   * - `ready` jobs past `expires_at`: file unlinked, row deleted
   * - `failed` jobs older than EXPORT_FAILED_RETENTION_HOURS: file unlinked, row deleted
   * - `processing` jobs older than EXPORT_STUCK_PROCESSING_MINUTES: partial file
   *   unlinked, job marked `failed` (deleted on a later run by the rule above)
   * - files in EXPORT_DIR with no matching job row and older than
   *   EXPORT_ORPHAN_GRACE_MINUTES: unlinked
   */
  async cleanupExports(): Promise<ExportCleanupResult> {
    const now = Date.now();
    const result: ExportCleanupResult = {
      expired: 0,
      failed: 0,
      stuck: 0,
      orphans: 0,
    };

    const expired = await this.jobRepo.find({
      where: { status: 'ready', expires_at: LessThan(new Date(now)) },
    });
    for (const job of expired) {
      await this.removeJobFile(job);
      await this.jobRepo.delete(job.id);
      result.expired++;
    }

    const failedRetentionHours = Number(
      this.configService.get<number>('EXPORT_FAILED_RETENTION_HOURS', 24),
    );
    const failed = await this.jobRepo.find({
      where: {
        status: 'failed',
        updated_at: LessThan(new Date(now - failedRetentionHours * 3_600_000)),
      },
    });
    for (const job of failed) {
      await this.removeJobFile(job);
      await this.jobRepo.delete(job.id);
      result.failed++;
    }

    const stuckMinutes = Number(
      this.configService.get<number>('EXPORT_STUCK_PROCESSING_MINUTES', 60),
    );
    const stuck = await this.jobRepo.find({
      where: {
        status: 'processing',
        updated_at: LessThan(new Date(now - stuckMinutes * 60_000)),
      },
    });
    for (const job of stuck) {
      await this.removeJobFile(job);
      await this.jobRepo.update(job.id, {
        status: 'failed',
        file_path: null,
        expires_at: null,
      });
      result.stuck++;
    }

    result.orphans = await this.removeOrphanFiles(now);

    return result;
  }

  private exportDir(): string {
    return this.configService.get<string>('EXPORT_DIR', './exports');
  }

  private async removeJobFile(job: DataExportJob): Promise<void> {
    const filePath =
      job.file_path ?? path.join(this.exportDir(), `${job.id}.json`);
    await fs.unlink(filePath).catch(() => {});
  }

  private async removeOrphanFiles(now: number): Promise<number> {
    const dir = this.exportDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return 0;
    }

    const graceMinutes = Number(
      this.configService.get<number>('EXPORT_ORPHAN_GRACE_MINUTES', 60),
    );
    const cutoff = now - graceMinutes * 60_000;

    // Only consider files named like export jobs (`<uuid>.json`) so unrelated
    // files that happen to live in EXPORT_DIR are never touched.
    const candidates: { jobId: string; filePath: string }[] = [];
    for (const name of entries) {
      const jobId = path.basename(name, '.json');
      if (!name.endsWith('.json') || !UUID_PATTERN.test(jobId)) continue;
      const filePath = path.join(dir, name);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || stat.mtimeMs > cutoff) continue;
      } catch {
        continue;
      }
      candidates.push({ jobId, filePath });
    }
    if (candidates.length === 0) return 0;

    const knownJobs = await this.jobRepo.find({
      where: { id: In(candidates.map((c) => c.jobId)) },
      select: ['id'],
    });
    const known = new Set(knownJobs.map((j) => j.id));

    let removed = 0;
    for (const c of candidates) {
      if (known.has(c.jobId)) continue;
      try {
        await fs.unlink(c.filePath);
        removed++;
      } catch {
        // already gone or not removable; skip
      }
    }
    return removed;
  }
}
