import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends prediction_fraud_flags for the per-prediction fraud rules engine:
 * rule id + prediction link, and a write-once evidence snapshot. A trigger
 * rejects any UPDATE that changes evidence/evidence_hash once set, so the
 * snapshot stays tamper-evident even for writes that bypass the ORM.
 * Also records the submitting device fingerprint on predictions for the
 * duplicate-burst rule.
 */
export class AddPredictionFraudRuleEvidence1788200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "prediction_fraud_flags"
        ADD COLUMN "prediction_id" uuid,
        ADD COLUMN "rule_id" varchar(50),
        ADD COLUMN "evidence" jsonb,
        ADD COLUMN "evidence_hash" varchar(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "prediction_fraud_flags"
        ADD CONSTRAINT "FK_prediction_fraud_flags_prediction"
        FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id")
        ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_prediction_fraud_flags_prediction_rule"
        ON "prediction_fraud_flags" ("prediction_id", "rule_id")
        WHERE "prediction_id" IS NOT NULL AND "rule_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prediction_fraud_flags_evidence_immutable()
      RETURNS trigger AS $$
      BEGIN
        IF (OLD."evidence" IS NOT NULL OR OLD."evidence_hash" IS NOT NULL)
          AND (NEW."evidence" IS DISTINCT FROM OLD."evidence"
            OR NEW."evidence_hash" IS DISTINCT FROM OLD."evidence_hash") THEN
          RAISE EXCEPTION 'evidence snapshot of fraud flag % is immutable', OLD."id";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_prediction_fraud_flags_evidence_immutable"
        BEFORE UPDATE ON "prediction_fraud_flags"
        FOR EACH ROW
        EXECUTE FUNCTION prediction_fraud_flags_evidence_immutable()
    `);

    await queryRunner.query(`
      ALTER TABLE "predictions"
        ADD COLUMN "device_fingerprint" varchar(128)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_predictions_device_fingerprint_submitted_at"
        ON "predictions" ("device_fingerprint", "submitted_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_predictions_device_fingerprint_submitted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "predictions" DROP COLUMN "device_fingerprint"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "TRG_prediction_fraud_flags_evidence_immutable" ON "prediction_fraud_flags"`,
    );
    await queryRunner.query(
      `DROP FUNCTION prediction_fraud_flags_evidence_immutable()`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_prediction_fraud_flags_prediction_rule"`,
    );
    await queryRunner.query(`
      ALTER TABLE "prediction_fraud_flags"
        DROP CONSTRAINT "FK_prediction_fraud_flags_prediction"
    `);
    await queryRunner.query(`
      ALTER TABLE "prediction_fraud_flags"
        DROP COLUMN "evidence_hash",
        DROP COLUMN "evidence",
        DROP COLUMN "rule_id",
        DROP COLUMN "prediction_id"
    `);
  }
}
