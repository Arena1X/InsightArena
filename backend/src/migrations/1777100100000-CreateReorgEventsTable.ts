import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateReorgEventsTable1777100100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'reorg_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'contract_id',
            type: 'varchar',
            length: '128',
          },
          {
            name: 'fork_ledger',
            type: 'bigint',
          },
          {
            name: 'previous_ledger',
            type: 'bigint',
          },
          {
            name: 'previous_hash',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'new_hash',
            type: 'varchar',
            length: '128',
            isNullable: true,
          },
          {
            name: 'rolled_back_event_count',
            type: 'int',
          },
          {
            name: 'detected_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'reorg_events',
      new TableIndex({
        name: 'IDX_reorg_events_contract_id',
        columnNames: ['contract_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('reorg_events', 'IDX_reorg_events_contract_id');
    await queryRunner.dropTable('reorg_events');
  }
}
