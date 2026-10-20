import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateIdempotencyKeys1776500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'idempotency_keys',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'key',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            // sha256 of method+path+body — detects same-key/different-body reuse
            name: 'request_hash',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            // Null while the original request is still executing
            name: 'status_code',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'response_body',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'in_progress',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
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

    // Enforces one row per (key, user) — the source of the 409/422 checks
    await queryRunner.createIndex(
      'idempotency_keys',
      new TableIndex({
        name: 'IDX_idempotency_key_user',
        columnNames: ['key', 'userId'],
        isUnique: true,
      }),
    );

    // Used by the cleanup cron to find expired rows
    await queryRunner.createIndex(
      'idempotency_keys',
      new TableIndex({
        name: 'IDX_idempotency_created_at',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createForeignKey(
      'idempotency_keys',
      new TableForeignKey({
        name: 'FK_idempotency_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('idempotency_keys', 'FK_idempotency_user');
    await queryRunner.dropTable('idempotency_keys');
  }
}
