import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintLeaderboardEntryUserSeason1774500003000 implements MigrationInterface {
  name = 'AddUniqueConstraintLeaderboardEntryUserSeason1774500003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leaderboard_entries"
        ADD CONSTRAINT "UQ_leaderboard_entries_user_season"
        UNIQUE ("user_id", "season_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leaderboard_entries"
        DROP CONSTRAINT "UQ_leaderboard_entries_user_season"
    `);
  }
}
