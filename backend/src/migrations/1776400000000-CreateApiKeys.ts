import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateApiKeys1776400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'api_keys',
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
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            // First 10 chars of the raw key (e.g. 'ia_4f9a1b')
            // — safe to store and display, not a secret
            name: 'key_prefix',
            type: 'varchar',
            length: '12',
            isNullable: false,
          },
          {
            // bcrypt hash of the full raw key — never exposed via API
            name: 'key_hash',
            type: 'varchar',
            isNullable: false,
          },
          {
            // Postgres text[] — e.g. {'predictions:read','markets:read'}
            name: 'scopes',
            type: 'text',
            isArray: true,
            default: "'{}'",
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'revoked_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_used_at',
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

    // --- Indexes -----------------------------------------------------------

    // Look up all keys belonging to a user
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_ak_user_id',
        columnNames: ['userId'],
      }),
    );

    // Narrow bcrypt candidates by prefix (guard hot path)
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_ak_key_prefix',
        columnNames: ['key_prefix'],
      }),
    );

    // Filter active (non-revoked) keys
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_ak_revoked_at',
        columnNames: ['revoked_at'],
      }),
    );

    // Filter non-expired keys
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_ak_expires_at',
        columnNames: ['expires_at'],
      }),
    );

    // Composite: user's active keys (list endpoint)
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_ak_user_revoked',
        columnNames: ['userId', 'revoked_at'],
      }),
    );

    // --- Foreign key -------------------------------------------------------

    await queryRunner.createForeignKey(
      'api_keys',
      new TableForeignKey({
        name: 'FK_ak_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('api_keys', 'FK_ak_user');
    await queryRunner.dropTable('api_keys');
  }
}
