import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddExternalMatchResultIngestion1777300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'event_matches',
      new TableColumn({
        name: 'external_id',
        type: 'varchar',
        length: '255',
        isNullable: true,
        isUnique: true,
      }),
    );
    await queryRunner.createTable(
      new Table({
        name: 'external_match_results',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            isGenerated: true,
          },
          { name: 'match_id', type: 'uuid' },
          { name: 'external_id', type: 'varchar', length: '255' },
          { name: 'home_score', type: 'int' },
          { name: 'away_score', type: 'int' },
          {
            name: 'winning_team',
            type: 'enum',
            enum: ['TEAM_A', 'TEAM_B', 'DRAW'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING_CONFIRMATION'],
            default: "'PENDING_CONFIRMATION'",
          },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
    await queryRunner.createForeignKey(
      'external_match_results',
      new TableForeignKey({
        columnNames: ['match_id'],
        referencedTableName: 'event_matches',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'external_match_results',
      new TableIndex({ columnNames: ['match_id'], isUnique: true }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('external_match_results');
    await queryRunner.dropColumn('event_matches', 'external_id');
  }
}
