import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemConfigEntity1774600000000 implements MigrationInterface {
  name = 'CreateSystemConfigEntity1774600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "system_config" ("key" character varying NOT NULL, "value" jsonb NOT NULL, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_system_config" PRIMARY KEY ("key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "system_config"`);
  }
}
