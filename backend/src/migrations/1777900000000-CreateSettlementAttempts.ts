import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateSettlementAttempts1777900000000 implements MigrationInterface {
  name = 'CreateSettlementAttempts1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New intermediate settlement state: claimed-but-not-yet-confirmed.
    await queryRunner.query(
      `ALTER TYPE "public"."market_settlement_state" ADD VALUE IF NOT EXISTS 'settling' AFTER 'proposed'`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'settlement_attempts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'market_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            default: `'resolving'`,
            isNullable: false,
          },
          {
            name: 'proposed_outcome',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'settlement_attempts',
      new TableForeignKey({
        name: 'FK_settlement_attempts_market',
        columnNames: ['market_id'],
        referencedTableName: 'markets',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'settlement_attempts',
      new TableIndex({
        name: 'IDX_settlement_attempts_market_created',
        columnNames: ['market_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'settlement_attempts',
      new TableIndex({
        name: 'IDX_settlement_attempts_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('settlement_attempts');
    // Postgres cannot drop a single enum value; 'settling' is left in the
    // type on down-migration (harmless — no row will reference it once the
    // scheduler code is reverted alongside this migration).
  }
}
