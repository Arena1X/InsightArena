import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPredictionNoteColumn1775000000000 implements MigrationInterface {
  name = 'AddPredictionNoteColumn1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "predictions" ADD "note" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "predictions" DROP COLUMN "note"`);
  }
}
