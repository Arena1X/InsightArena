import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCreatorEventLeaderboardEntry1750200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'creator_event_leaderboard_entries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'event_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'user_address',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          { name: 'rank', type: 'int', isNullable: false },
          {
            name: 'total_predictions',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'correct_predictions',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'accuracy_percentage',
            type: 'numeric',
            precision: 5,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'is_winner',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          { name: 'completion_time', type: 'timestamptz', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'creator_event_leaderboard_entries',
      new TableIndex({
        name: 'UQ_cel_entry_event_address',
        columnNames: ['event_id', 'user_address'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'creator_event_leaderboard_entries',
      new TableIndex({
        name: 'IDX_cel_entry_event_rank',
        columnNames: ['event_id', 'rank'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('creator_event_leaderboard_entries');
  }
}
