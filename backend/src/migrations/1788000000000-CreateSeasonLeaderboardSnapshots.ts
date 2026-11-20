import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSeasonLeaderboardSnapshots1788000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'season_leaderboard_snapshots',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            isGenerated: true,
          },
          { name: 'season_id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'rank', type: 'int' },
          { name: 'season_points', type: 'int' },
          { name: 'captured_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'season_leaderboard_snapshots',
      new TableForeignKey({
        columnNames: ['season_id'],
        referencedTableName: 'seasons',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'season_leaderboard_snapshots',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'season_leaderboard_snapshots',
      new TableIndex({
        columnNames: ['season_id', 'user_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'season_leaderboard_snapshots',
      new TableIndex({
        columnNames: ['season_id', 'rank'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('season_leaderboard_snapshots');
  }
}
