import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserBookmarksTable1774500004000 implements MigrationInterface {
  name = 'CreateUserBookmarksTable1774500004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_bookmarks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "market_id" uuid, CONSTRAINT "PK_user_bookmarks_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_bookmark_unique" ON "user_bookmarks" ("user_id", "market_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_bookmarks" ADD CONSTRAINT "FK_user_bookmarks_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_bookmarks" ADD CONSTRAINT "FK_user_bookmarks_market" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_bookmarks" DROP CONSTRAINT "FK_user_bookmarks_market"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_bookmarks" DROP CONSTRAINT "FK_user_bookmarks_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_user_bookmark_unique"`);
    await queryRunner.query(`DROP TABLE "user_bookmarks"`);
  }
}
