import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeaderboardSnapshotsTable1776600000000 implements MigrationInterface {
  name = 'CreateLeaderboardSnapshotsTable1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "leaderboard_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "season_id" uuid,
        "captured_at" TIMESTAMPTZ NOT NULL,
        "rank" integer NOT NULL DEFAULT 0,
        "score" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_leaderboard_snapshots_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_leaderboard_snapshots_user_season_captured" UNIQUE ("user_id", "season_id", "captured_at")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_leaderboard_snapshots_season_captured" ON "leaderboard_snapshots" ("season_id", "captured_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_leaderboard_snapshots_user_captured" ON "leaderboard_snapshots" ("user_id", "captured_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_leaderboard_snapshots_user_captured"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_leaderboard_snapshots_season_captured"`,
    );
    await queryRunner.query(`DROP TABLE "leaderboard_snapshots"`);
  }
}
