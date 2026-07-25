import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLastIndexedLedgerHashToChainSyncCheckpoint1777100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'chain_sync_checkpoints',
      new TableColumn({
        name: 'last_indexed_ledger_hash',
        type: 'varchar',
        length: '128',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(
      'chain_sync_checkpoints',
      'last_indexed_ledger_hash',
    );
  }
}
