import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateWebhooksTablesWithDelivery1776100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create webhook_endpoints table
    await queryRunner.createTable(
      new Table({
        name: 'webhook_endpoints',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'url',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'event_types',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'secret_key',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'failure_count',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'last_delivery_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_failure_at',
            type: 'timestamptz',
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
        ],
      }),
      true,
    );

    // Create indices for webhook_endpoints
    await queryRunner.createIndex(
      'webhook_endpoints',
      new TableIndex({
        name: 'IDX_we_user_id',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_endpoints',
      new TableIndex({
        name: 'IDX_we_user_is_active',
        columnNames: ['userId', 'is_active'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_endpoints',
      new TableIndex({
        name: 'IDX_we_event_types',
        columnNames: ['event_types'],
      }),
    );

    // Create foreign key for webhook_endpoints
    await queryRunner.createForeignKey(
      'webhook_endpoints',
      new TableForeignKey({
        name: 'FK_we_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create webhook_delivery_logs table
    await queryRunner.createTable(
      new Table({
        name: 'webhook_delivery_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'endpoint_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'event_type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'attempt_count',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'http_status_code',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'next_retry_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'delivered_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indices for webhook_delivery_logs
    await queryRunner.createIndex(
      'webhook_delivery_logs',
      new TableIndex({
        name: 'IDX_wdl_endpoint_id',
        columnNames: ['endpoint_id'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_delivery_logs',
      new TableIndex({
        name: 'IDX_wdl_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_delivery_logs',
      new TableIndex({
        name: 'IDX_wdl_event_type',
        columnNames: ['event_type'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_delivery_logs',
      new TableIndex({
        name: 'IDX_wdl_endpoint_status',
        columnNames: ['endpoint_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_delivery_logs',
      new TableIndex({
        name: 'IDX_wdl_created_at',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_delivery_logs',
      new TableIndex({
        name: 'IDX_wdl_endpoint_created_at',
        columnNames: ['endpoint_id', 'created_at'],
      }),
    );

    // Create foreign key for webhook_delivery_logs
    await queryRunner.createForeignKey(
      'webhook_delivery_logs',
      new TableForeignKey({
        name: 'FK_wdl_endpoint',
        columnNames: ['endpoint_id'],
        referencedTableName: 'webhook_endpoints',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_delivery_logs');
    await queryRunner.dropTable('webhook_endpoints');
  }
}
