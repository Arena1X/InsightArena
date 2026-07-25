import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWebhookProcessedEvents1777200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'webhook_processed_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'source',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'event_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'received_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'webhook_processed_events',
      new TableIndex({
        name: 'IDX_webhook_processed_events_source_event_id',
        columnNames: ['source', 'event_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_processed_events');
  }
}
