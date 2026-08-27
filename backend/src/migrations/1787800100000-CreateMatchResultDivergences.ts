import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateMatchResultDivergences1787800100000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'match_result_divergences',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            isGenerated: true,
          },
          { name: 'match_id', type: 'uuid' },
          { name: 'source_a_name', type: 'varchar', length: '100' },
          { name: 'source_a_value', type: 'jsonb' },
          { name: 'source_b_name', type: 'varchar', length: '100' },
          { name: 'source_b_value', type: 'jsonb' },
          { name: 'resolved', type: 'boolean', default: false },
          { name: 'resolved_at', type: 'timestamptz', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'match_result_divergences',
      new TableForeignKey({
        columnNames: ['match_id'],
        referencedTableName: 'event_matches',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'match_result_divergences',
      new TableIndex({ columnNames: ['match_id'] }),
    );
    await queryRunner.createIndex(
      'match_result_divergences',
      new TableIndex({ columnNames: ['resolved'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('match_result_divergences');
  }
}
