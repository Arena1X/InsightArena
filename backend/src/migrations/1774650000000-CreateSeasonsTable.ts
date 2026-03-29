import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSeasonsTable1774650000000 implements MigrationInterface {
  name = 'CreateSeasonsTable1774650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seasons" (
        "id"                    uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "season_number"        integer           NOT NULL,
        "name"                  character varying(255) NOT NULL,
        "starts_at"             TIMESTAMP         NOT NULL,
        "ends_at"               TIMESTAMP         NOT NULL,
        "reward_pool_stroops"   bigint            NOT NULL DEFAULT 0,
        "is_active"             boolean           NOT NULL DEFAULT false,
        "on_chain_season_id"    integer,
        "soroban_tx_hash"       character varying(128),
        "created_at"            TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seasons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_seasons_season_number" UNIQUE ("season_number")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seasons_is_active" ON "seasons" ("is_active")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seasons_starts_ends" ON "seasons" ("starts_at", "ends_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_seasons_starts_ends"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_seasons_is_active"`);
    await queryRunner.query(`DROP TABLE "seasons"`);
  }
}
