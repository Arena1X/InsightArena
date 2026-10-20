import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes oracle match-result submissions idempotent: a duplicate webhook call
 * (network retry, oracle re-delivery) resolves to the original submission
 * instead of creating a second record and a second on-chain attempt.
 */
export class AddOracleSubmissionIdempotency1788100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oracle_submissions"
        ADD COLUMN "job_id" varchar(64),
        ADD COLUMN "idempotency_key" varchar(255)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_oracle_submissions_idempotency_key"
        ON "oracle_submissions" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_submissions_job_id"
        ON "oracle_submissions" ("job_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_oracle_submissions_job_id"`);
    await queryRunner.query(
      `DROP INDEX "UQ_oracle_submissions_idempotency_key"`,
    );
    await queryRunner.query(`
      ALTER TABLE "oracle_submissions"
        DROP COLUMN "idempotency_key",
        DROP COLUMN "job_id"
    `);
  }
}
