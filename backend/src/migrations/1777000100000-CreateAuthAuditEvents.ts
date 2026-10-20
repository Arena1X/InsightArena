import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateAuthAuditEvents1777000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'auth_audit_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'family_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
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

    await queryRunner.createIndex(
      'auth_audit_events',
      new TableIndex({
        name: 'IDX_auth_audit_events_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'auth_audit_events',
      new TableIndex({
        name: 'IDX_auth_audit_events_family_id',
        columnNames: ['family_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'auth_audit_events',
      new TableForeignKey({
        name: 'FK_auth_audit_events_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'auth_audit_events',
      'FK_auth_audit_events_user',
    );
    await queryRunner.dropTable('auth_audit_events');
  }
}
