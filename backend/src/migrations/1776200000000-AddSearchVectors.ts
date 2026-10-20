import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchVectors1776200000000 implements MigrationInterface {
  name = 'AddSearchVectors1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // markets: weight title A, description B
    await queryRunner.query(`
      ALTER TABLE "markets"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(description, '')), 'B')
          ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_markets_search_vector"
        ON "markets" USING GIN("search_vector")
    `);

    // users: weight username A, stellar_address B (simple dict — addresses aren't English)
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('simple', coalesce(username, '')), 'A') ||
            setweight(to_tsvector('simple', coalesce(stellar_address, '')), 'B')
          ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_search_vector"
        ON "users" USING GIN("search_vector")
    `);

    // competitions: weight title A, description B
    await queryRunner.query(`
      ALTER TABLE "competitions"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(description, '')), 'B')
          ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_competitions_search_vector"
        ON "competitions" USING GIN("search_vector")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // markets
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_markets_search_vector"`);
    await queryRunner.query(
      `ALTER TABLE "markets" DROP COLUMN IF EXISTS "search_vector"`,
    );

    // users
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_search_vector"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "search_vector"`,
    );

    // competitions
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_competitions_search_vector"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitions" DROP COLUMN IF EXISTS "search_vector"`,
    );
  }
}
