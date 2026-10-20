import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatorEventsSearchIndexes1775600000000 implements MigrationInterface {
  name = 'AddCreatorEventsSearchIndexes1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_events"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
            setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
            setweight(to_tsvector('english', coalesce("category", '')), 'B') ||
            setweight(to_tsvector('simple', coalesce("creator_address", '')), 'C')
          ) STORED
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_search_vector"
        ON "creator_events" USING GIN("search_vector")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_status_creator"
      ON "creator_events" ("is_active", "is_cancelled", "creator_address")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_status_creator"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_search_vector"`,
    );
    await queryRunner.query(
      `ALTER TABLE "creator_events" DROP COLUMN IF EXISTS "search_vector"`,
    );
  }
}
