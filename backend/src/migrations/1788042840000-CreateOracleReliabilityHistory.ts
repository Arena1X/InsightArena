import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOracleReliabilityHistory1788042840000 implements MigrationInterface {
  name = 'CreateOracleReliabilityHistory1788042840000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "oracle_reliability_history" (
        "id"                  uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "data_source"         varchar(500)      NOT NULL,
        "match_id"            varchar(255)      NOT NULL,
        "was_correct"         boolean           NOT NULL,
        "previous_score"      double precision,
        "new_score"           double precision  NOT NULL,
        "total_submissions"   integer           NOT NULL,
        "correct_submissions" integer           NOT NULL,
        "created_at"          timestamptz       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oracle_reliability_history" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_reliability_history_data_source" ON "oracle_reliability_history" ("data_source")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_reliability_history_data_source_created_at" ON "oracle_reliability_history" ("data_source", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_oracle_reliability_history_data_source_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_oracle_reliability_history_data_source"`);
    await queryRunner.query(`DROP TABLE "oracle_reliability_history"`);
  }
}
