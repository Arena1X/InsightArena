import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Covering indexes for the GET /markets filtered-list query builder
 * (`MarketsService.findAllFiltered`), which filters on `category`,
 * `is_resolved`/`is_cancelled` (status), and `is_public`, then always
 * orders by `is_featured DESC, featured_at DESC, created_at DESC`. The
 * existing single-column indexes on `category`/`is_resolved`/`is_featured`
 * don't let Postgres satisfy a filtered+sorted query with a single index
 * scan, so large tables fall back to a sequential scan or an inefficient
 * bitmap-and-sort. These composite indexes put the common filter columns
 * first and the sort columns after, so the planner can use them directly.
 */
export class AddMarketsFilteringIndexes1787655600000
  implements MigrationInterface
{
  name = 'AddMarketsFilteringIndexes1787655600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_markets_status_sort"
      ON "markets" ("is_resolved", "is_cancelled", "is_featured", "featured_at", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_markets_category_status_sort"
      ON "markets" ("category", "is_resolved", "is_cancelled", "is_featured", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_markets_public_sort"
      ON "markets" ("is_public", "is_featured", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_markets_public_sort"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_markets_category_status_sort"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_markets_status_sort"`);
  }
}
