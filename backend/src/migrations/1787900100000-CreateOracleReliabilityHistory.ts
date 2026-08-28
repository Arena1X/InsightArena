import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOracleReliabilityHistory1787900100000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "oracle_reliability_history" (
        "id"                  uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "data_source"         varchar(500)      NOT NULL,
        "was_correct"         boolean           NOT NULL,
        "reliability_score"   double precision  NOT NULL,
        "total_submissions"   integer           NOT NULL DEFAULT 0,
        "correct_submissions" integer           NOT NULL DEFAULT 0,
        "match_id"            varchar(255),
        "created_at"          timestamptz       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oracle_reliability_history" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_oracle_reliability_history_source_created"
        ON "oracle_reliability_history" ("data_source", "created_at");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "oracle_reliability_history"`);
  }
}
