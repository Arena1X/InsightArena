import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParticipantCountToSeasons1775300000000 implements MigrationInterface {
  name = 'AddParticipantCountToSeasons1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "seasons"
        ADD COLUMN "participant_count" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "seasons" DROP COLUMN "participant_count"
    `);
  }
}
