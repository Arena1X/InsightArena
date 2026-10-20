import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotalEntryFeesCollected1775900000000 implements MigrationInterface {
  name = 'AddTotalEntryFeesCollected1775900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_events"
        ADD COLUMN IF NOT EXISTS "total_entry_fees_collected" BIGINT DEFAULT '0'
    `);

    await queryRunner.query(`
      UPDATE "creator_events"
      SET "total_entry_fees_collected" = 0
      WHERE "total_entry_fees_collected" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "creator_events"
        ALTER COLUMN "total_entry_fees_collected" SET DEFAULT '0',
        ALTER COLUMN "total_entry_fees_collected" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_events"
        DROP COLUMN IF EXISTS "total_entry_fees_collected"
    `);
  }
}
