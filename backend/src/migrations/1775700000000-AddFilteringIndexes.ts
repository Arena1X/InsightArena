import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFilteringIndexes1775700000000 implements MigrationInterface {
  name = 'AddFilteringIndexes1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_status_created"
      ON "creator_events" ("is_active", "is_cancelled", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_creator_created"
      ON "creator_events" ("creator_address", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_participant_count"
      ON "creator_events" ("participant_count")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_match_count"
      ON "creator_events" ("match_count")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_event_matches_result_match_time"
      ON "event_matches" ("result_submitted", "match_time")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_event_matches_match_time"
      ON "event_matches" ("match_time")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_event_matches_submitted_by"
      ON "event_matches" ("submitted_by")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_predictions_submitted_at"
      ON "predictions" ("submitted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_predictions_payout_submitted"
      ON "predictions" ("payout_claimed", "submitted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_predictions_payout_submitted"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_predictions_submitted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_event_matches_submitted_by"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_event_matches_match_time"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_event_matches_result_match_time"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_match_count"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_participant_count"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_creator_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_status_created"`,
    );
  }
}
