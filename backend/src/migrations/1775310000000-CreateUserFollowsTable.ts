import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserFollowsTable1775310000000 implements MigrationInterface {
  name = 'CreateUserFollowsTable1775310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_follows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "follower_id" uuid NOT NULL, "following_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_user_follows_follower_following" UNIQUE ("follower_id", "following_id"), CONSTRAINT "PK_user_follows_id" PRIMARY KEY ("id"), CONSTRAINT "FK_user_follows_follower_id" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "FK_user_follows_following_id" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_follows_follower_id" ON "user_follows" ("follower_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_follows_following_id" ON "user_follows" ("following_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_follows_following_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_follows_follower_id"`,
    );
    await queryRunner.query(`DROP TABLE "user_follows"`);
  }
}
