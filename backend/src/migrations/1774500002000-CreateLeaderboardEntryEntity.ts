import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeaderboardEntryEntity1774500002000 implements MigrationInterface {
  name = 'CreateLeaderboardEntryEntity1774500002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "leaderboard_entries" (
        "id"                     uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"                uuid              NOT NULL,
        "season_id"              character varying,
        "rank"                   integer           NOT NULL DEFAULT 0,
        "reputation_score"       integer           NOT NULL DEFAULT 0,
        "season_points"          integer           NOT NULL DEFAULT 0,
        "total_predictions"      integer           NOT NULL DEFAULT 0,
        "correct_predictions"    integer           NOT NULL DEFAULT 0,
        "total_winnings_stroops" bigint            NOT NULL DEFAULT 0,
        "created_at"             TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leaderboard_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_leaderboard_entries_user_id" ON "leaderboard_entries" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_leaderboard_entries_season_rank"
        ON "leaderboard_entries" ("season_id", "rank")
    `);

    await queryRunner.query(`
      ALTER TABLE "leaderboard_entries"
        ADD CONSTRAINT "FK_leaderboard_entries_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leaderboard_entries" DROP CONSTRAINT "FK_leaderboard_entries_user"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_leaderboard_entries_season_rank"`);
    await queryRunner.query(`DROP INDEX "IDX_leaderboard_entries_user_id"`);
    await queryRunner.query(`DROP TABLE "leaderboard_entries"`);
  }
}
