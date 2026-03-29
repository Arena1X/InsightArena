import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonFinalizationColumns1774660000000 implements MigrationInterface {
  name = 'AddSeasonFinalizationColumns1774660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "seasons"
        ADD COLUMN "is_finalized" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "seasons"
        ADD COLUMN "top_winner_user_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "seasons"
        ADD CONSTRAINT "FK_seasons_top_winner_user"
        FOREIGN KEY ("top_winner_user_id") REFERENCES "users"("id")
        ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_seasons_is_finalized" ON "seasons" ("is_finalized")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_seasons_is_finalized"`);
    await queryRunner.query(`
      ALTER TABLE "seasons" DROP CONSTRAINT "FK_seasons_top_winner_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "seasons" DROP COLUMN "top_winner_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "seasons" DROP COLUMN "is_finalized"
    `);
  }
}
