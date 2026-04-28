import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompetitionCancelledFlag1775400000000 implements MigrationInterface {
  name = 'AddCompetitionCancelledFlag1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "competitions"
      ADD COLUMN "is_cancelled" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "competitions"
      DROP COLUMN "is_cancelled"
    `);
  }
}
