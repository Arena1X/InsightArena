import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOracleSourceReliability1777400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "oracle_source_reliability" (
        "id"                  uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "data_source"         varchar(500)      NOT NULL,
        "total_submissions"   integer           NOT NULL DEFAULT 0,
        "correct_submissions" integer           NOT NULL DEFAULT 0,
        "reliability_score"   double precision,
        "created_at"          timestamptz       NOT NULL DEFAULT now(),
        "updated_at"          timestamptz       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oracle_source_reliability" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_oracle_source_reliability_source" UNIQUE ("data_source")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "oracle_source_reliability"`);
  }
}
