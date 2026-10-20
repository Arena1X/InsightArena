import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigestSchedulingToUserPreferences1777400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ADD COLUMN IF NOT EXISTS "digest_hour" integer NOT NULL DEFAULT 8
    `);
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ADD COLUMN IF NOT EXISTS "digest_timezone" varchar NOT NULL DEFAULT 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "digest_timezone"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "digest_hour"
    `);
  }
}
