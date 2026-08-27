import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateUserReferrals1777700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_referrals',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'referrer_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'referred_id',
            type: 'uuid',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'qualified_at',
            type: 'timestamptz',
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
      'user_referrals',
      new TableIndex({
        name: 'IDX_user_referrals_referrer_id',
        columnNames: ['referrer_id'],
      }),
    );

    await queryRunner.createIndex(
      'user_referrals',
      new TableIndex({
        name: 'IDX_user_referrals_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createForeignKey(
      'user_referrals',
      new TableForeignKey({
        name: 'FK_user_referrals_referrer',
        columnNames: ['referrer_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_referrals',
      new TableForeignKey({
        name: 'FK_user_referrals_referred',
        columnNames: ['referred_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'user_referrals',
      'FK_user_referrals_referred',
    );
    await queryRunner.dropForeignKey(
      'user_referrals',
      'FK_user_referrals_referrer',
    );
    await queryRunner.dropTable('user_referrals');
  }
}
