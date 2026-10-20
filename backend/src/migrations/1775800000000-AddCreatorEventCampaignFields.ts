import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatorEventCampaignFields1775800000000 implements MigrationInterface {
  name = 'AddCreatorEventCampaignFields1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_events"
        ADD COLUMN IF NOT EXISTS "start_time" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "end_time" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "prize_pool" BIGINT DEFAULT '0',
        ADD COLUMN IF NOT EXISTS "reward_distribution" INTEGER[] DEFAULT '{}'::integer[],
        ADD COLUMN IF NOT EXISTS "entry_fee" BIGINT DEFAULT '0',
        ADD COLUMN IF NOT EXISTS "category" VARCHAR(100) DEFAULT 'general',
        ADD COLUMN IF NOT EXISTS "banner_url" VARCHAR(2048),
        ADD COLUMN IF NOT EXISTS "is_finalized" BOOLEAN DEFAULT false
    `);

    await queryRunner.query(`
      WITH backfill AS (
        SELECT
          "id",
          COALESCE("start_time", "on_chain_created_at", "created_at", NOW()) AS normalized_start_time,
          COALESCE(
            NULLIF(
              btrim(
                substring(
                  regexp_replace(
                    regexp_replace(lower(btrim("category")), '[^a-z0-9_-]+', '-', 'g'),
                    '-+',
                    '-',
                    'g'
                  )
                  FROM 1 FOR 100
                ),
                '-'
              ),
              ''
            ),
            'general'
          ) AS normalized_category
        FROM "creator_events"
      )
      UPDATE "creator_events" AS creator_event
      SET
        "start_time" = backfill.normalized_start_time,
        "end_time" = CASE
          WHEN creator_event."end_time" IS NULL
            OR creator_event."end_time" <= backfill.normalized_start_time
          THEN backfill.normalized_start_time + INTERVAL '90 days'
          ELSE creator_event."end_time"
        END,
        "prize_pool" = COALESCE(creator_event."prize_pool", 0),
        "reward_distribution" = COALESCE(creator_event."reward_distribution", '{}'::integer[]),
        "entry_fee" = COALESCE(creator_event."entry_fee", 0),
        "category" = backfill.normalized_category,
        "is_finalized" = COALESCE(creator_event."is_finalized", false)
      FROM backfill
      WHERE
        creator_event."id" = backfill."id" AND
        (
          creator_event."start_time" IS NULL OR
          creator_event."end_time" IS NULL OR
          creator_event."end_time" <= backfill.normalized_start_time OR
          creator_event."prize_pool" IS NULL OR
          creator_event."reward_distribution" IS NULL OR
          creator_event."entry_fee" IS NULL OR
          creator_event."category" IS DISTINCT FROM backfill.normalized_category OR
          creator_event."is_finalized" IS NULL
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "creator_events"
        ALTER COLUMN "start_time" SET NOT NULL,
        ALTER COLUMN "end_time" SET NOT NULL,
        ALTER COLUMN "prize_pool" SET DEFAULT '0',
        ALTER COLUMN "prize_pool" SET NOT NULL,
        ALTER COLUMN "reward_distribution" SET DEFAULT '{}'::integer[],
        ALTER COLUMN "reward_distribution" SET NOT NULL,
        ALTER COLUMN "entry_fee" SET DEFAULT '0',
        ALTER COLUMN "entry_fee" SET NOT NULL,
        ALTER COLUMN "category" SET DEFAULT 'general',
        ALTER COLUMN "category" SET NOT NULL,
        ALTER COLUMN "is_finalized" SET DEFAULT false,
        ALTER COLUMN "is_finalized" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_category"
      ON "creator_events" ("category")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_events_campaign_window"
      ON "creator_events" ("is_active", "is_cancelled", "start_time", "end_time")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_campaign_window"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creator_events_category"`,
    );

    await queryRunner.query(`
      ALTER TABLE "creator_events"
        DROP COLUMN IF EXISTS "is_finalized",
        DROP COLUMN IF EXISTS "banner_url",
        DROP COLUMN IF EXISTS "category",
        DROP COLUMN IF EXISTS "entry_fee",
        DROP COLUMN IF EXISTS "reward_distribution",
        DROP COLUMN IF EXISTS "prize_pool",
        DROP COLUMN IF EXISTS "end_time",
        DROP COLUMN IF EXISTS "start_time"
    `);
  }
}
