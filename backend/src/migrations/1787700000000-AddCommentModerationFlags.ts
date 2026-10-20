import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCommentModerationFlags1787700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('comments', [
      new TableColumn({
        name: 'is_flagged',
        type: 'boolean',
        default: false,
      }),
      new TableColumn({
        name: 'flagged_reason',
        type: 'varchar',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('comments', 'flagged_reason');
    await queryRunner.dropColumn('comments', 'is_flagged');
  }
}
