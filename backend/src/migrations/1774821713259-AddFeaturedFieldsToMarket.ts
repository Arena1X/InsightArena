import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeaturedFieldsToMarket1774821713259 implements MigrationInterface {
  name = 'AddFeaturedFieldsToMarket1774821713259';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "markets" ADD "is_featured" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" ADD "featured_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_is_featured" ON "markets" ("is_featured")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_is_featured"`);
    await queryRunner.query(`ALTER TABLE "markets" DROP COLUMN "featured_at"`);
    await queryRunner.query(`ALTER TABLE "markets" DROP COLUMN "is_featured"`);
  }
}
