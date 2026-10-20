import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPgTrgmAndTrigramIndexes1776600000000 implements MigrationInterface {
  name = 'AddPgTrgmAndTrigramIndexes1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable the pg_trgm extension (requires superuser or pg_extension privilege)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // GIN trigram indexes on markets
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_markets_title_trgm"
        ON "markets" USING GIN (title gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_markets_description_trgm"
        ON "markets" USING GIN (description gin_trgm_ops)
    `);

    // GIN trigram indexes on users
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_username_trgm"
        ON "users" USING GIN (username gin_trgm_ops)
    `);

    // GIN trigram indexes on competitions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_competitions_title_trgm"
        ON "competitions" USING GIN (title gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_competitions_description_trgm"
        ON "competitions" USING GIN (description gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_competitions_description_trgm"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_competitions_title_trgm"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username_trgm"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_markets_description_trgm"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_markets_title_trgm"`);
    // Note: we intentionally do NOT drop the pg_trgm extension in down()
    // because other parts of the database may depend on it.
  }
}
