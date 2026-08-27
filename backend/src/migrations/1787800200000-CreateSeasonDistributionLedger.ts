import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSeasonDistributionLedger1787800200000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'season_distribution_ledger',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            isGenerated: true,
          },
          { name: 'season_id', type: 'uuid' },
          { name: 'recipient_user_id', type: 'uuid', isNullable: true },
          {
            name: 'recipient_stellar_address',
            type: 'varchar',
            length: '64',
          },
          { name: 'amount_stroops', type: 'bigint' },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'PENDING'",
          },
          { name: 'failure_reason', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'season_distribution_ledger',
      new TableForeignKey({
        columnNames: ['season_id'],
        referencedTableName: 'seasons',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'season_distribution_ledger',
      new TableForeignKey({
        columnNames: ['recipient_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'season_distribution_ledger',
      new TableIndex({
        columnNames: ['season_id', 'recipient_user_id'],
        isUnique: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('season_distribution_ledger');
  }
}
