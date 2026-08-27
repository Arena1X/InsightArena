import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Oracle median-basis anomaly evidence (#1611).
 *
 * Adds a nullable `baseline_median` column to `oracle_submission_flags` so
 * flags raised by the median-deviation rule record the consensus reference
 * point (the baseline median) alongside the existing mean/stddev evidence.
 */
export class AddOracleBaselineMedian1776800000000 implements MigrationInterface {
  name = 'AddOracleBaselineMedian1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oracle_submission_flags"
        ADD COLUMN "baseline_median" double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oracle_submission_flags"
        DROP COLUMN "baseline_median"
    `);
  }
}
