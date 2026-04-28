import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToNotifications1775200000000 implements MigrationInterface {
  name = 'AddSoftDeleteToNotifications1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "deleted_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "deleted_at"`,
    );
  }
}
