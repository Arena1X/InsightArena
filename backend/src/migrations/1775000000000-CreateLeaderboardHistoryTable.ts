import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeaderboardHistoryTable1775000000000 implements MigrationInterface {
  name = 'CreateLeaderboardHistoryTable1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "leaderboard_history" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "snapshot_date" DATE NOT NULL,
        "rank" integer NOT NULL DEFAULT 0,
        "reputation_score" integer NOT NULL DEFAULT 0,
        "season_points" integer NOT NULL DEFAULT 0,
        "total_predictions" integer NOT NULL DEFAULT 0,
        "correct_predictions" integer NOT NULL DEFAULT 0,
        "total_winnings_stroops" bigint NOT NULL DEFAULT 0,
        "season_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_leaderboard_history_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_leaderboard_history_user_date_season" UNIQUE ("user_id", "snapshot_date", "season_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_leaderboard_history_snapshot_date" ON "leaderboard_history" ("snapshot_date")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_leaderboard_history_user_id" ON "leaderboard_history" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_leaderboard_history_season_id" ON "leaderboard_history" ("season_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_leaderboard_history_season_id"`);
    await queryRunner.query(`DROP INDEX "IDX_leaderboard_history_user_id"`);
    await queryRunner.query(
      `DROP INDEX "IDX_leaderboard_history_snapshot_date"`,
    );
    await queryRunner.query(`DROP TABLE "leaderboard_history"`);
  }
}
