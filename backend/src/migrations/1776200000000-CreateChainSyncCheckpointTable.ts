import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateChainSyncCheckpointTable1776200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'chain_sync_checkpoints',
        columns: [
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
            isPrimary: true,
          },
          {
            name: 'last_indexed_ledger',
            type: 'bigint',
            default: '0',
          },
          {
            name: 'chain_head_ledger',
            type: 'bigint',
            default: '0',
          },
          {
            name: 'last_reconciled_from',
            type: 'bigint',
            default: '0',
          },
          {
            name: 'last_reconciled_to',
            type: 'bigint',
            default: '0',
          },
          {
            name: 'last_reconciled_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_backfill_count',
            type: 'int',
            default: '0',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('chain_sync_checkpoints');
  }
}
