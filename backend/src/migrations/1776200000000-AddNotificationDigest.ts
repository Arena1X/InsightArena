import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddNotificationDigest1776200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // digest_frequency on user_preferences
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ADD COLUMN IF NOT EXISTS "digest_frequency" varchar NOT NULL DEFAULT 'off'
    `);

    // email on users
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email" varchar NULL
    `);

    // notification_digest_state table
    await queryRunner.createTable(
      new Table({
        name: 'notification_digest_state',
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
            isNullable: false,
          },
          {
            name: 'last_daily_period',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'last_weekly_period',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            onUpdate: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'notification_digest_state',
      new TableIndex({
        name: 'UQ_notification_digest_state_user_id',
        columnNames: ['user_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification_digest_state', true);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "email"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "digest_frequency"
    `);
  }
}
