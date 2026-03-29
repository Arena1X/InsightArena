import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemStateEntity1774600000000 implements MigrationInterface {
  name = 'CreateSystemStateEntity1774600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "system_state" (
        "key"        character varying(128) NOT NULL,
        "value"      text                   NOT NULL,
        "updated_at" TIMESTAMP              NOT NULL DEFAULT now(),
        CONSTRAINT "PK_system_state_key" PRIMARY KEY ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "system_state"');
  }
}
