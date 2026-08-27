import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonRolloverProcessedAt1777300000000 implements MigrationInterface {
  name = 'AddSeasonRolloverProcessedAt1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "seasons"
      ADD COLUMN IF NOT EXISTS "rollover_processed_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "seasons"
      DROP COLUMN IF EXISTS "rollover_processed_at"
    `);
  }
}
