import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Oracle submission anomaly detection (#1364).
 *
 * Adds anomaly/review columns to `oracle_submissions` and creates the
 * `oracle_submission_flags` audit table.
 */
export class AddOracleAnomalyDetection1776700000000 implements MigrationInterface {
  name = 'AddOracleAnomalyDetection1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "oracle_submissions_review_status_enum" AS ENUM (
        'not_required', 'held', 'approved', 'rejected'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "oracle_submissions"
        ADD COLUMN "is_anomaly" boolean NOT NULL DEFAULT false,
        ADD COLUMN "anomaly_score" double precision,
        ADD COLUMN "review_status" "oracle_submissions_review_status_enum" NOT NULL DEFAULT 'not_required',
        ADD COLUMN "reviewed_by" varchar(255),
        ADD COLUMN "reviewed_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_submissions_is_anomaly" ON "oracle_submissions" ("is_anomaly")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_submissions_review_status" ON "oracle_submissions" ("review_status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_submissions_data_source_created" ON "oracle_submissions" ("data_source", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "oracle_submission_flags" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "submission_id" uuid NOT NULL,
        "match_id" varchar(255) NOT NULL,
        "data_source" varchar(500) NOT NULL,
        "observed_value" double precision NOT NULL,
        "baseline_mean" double precision NOT NULL,
        "baseline_stddev" double precision NOT NULL,
        "deviation" double precision NOT NULL,
        "threshold" double precision NOT NULL,
        "sample_size" integer NOT NULL,
        "held" boolean NOT NULL DEFAULT false,
        "reason" varchar(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_oracle_submission_flags_submission" FOREIGN KEY ("submission_id") REFERENCES "oracle_submissions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_submission_flags_submission" ON "oracle_submission_flags" ("submission_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_submission_flags_source_created" ON "oracle_submission_flags" ("data_source", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_submission_flags_held" ON "oracle_submission_flags" ("held")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_oracle_submission_flags_held"`);
    await queryRunner.query(
      `DROP INDEX "IDX_oracle_submission_flags_source_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_oracle_submission_flags_submission"`,
    );
    await queryRunner.query(`DROP TABLE "oracle_submission_flags"`);

    await queryRunner.query(
      `DROP INDEX "IDX_oracle_submissions_data_source_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_oracle_submissions_review_status"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_oracle_submissions_is_anomaly"`);
    await queryRunner.query(`
      ALTER TABLE "oracle_submissions"
        DROP COLUMN "reviewed_at",
        DROP COLUMN "reviewed_by",
        DROP COLUMN "review_status",
        DROP COLUMN "anomaly_score",
        DROP COLUMN "is_anomaly"
    `);
    await queryRunner.query(
      `DROP TYPE "oracle_submissions_review_status_enum"`,
    );
  }
}
