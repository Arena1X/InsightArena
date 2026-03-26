import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePredictionEntity1774500000000 implements MigrationInterface {
  name = 'CreatePredictionEntity1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "predictions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "chosen_outcome" character varying NOT NULL,
        "stake_amount_stroops" bigint NOT NULL,
        "payout_claimed" boolean NOT NULL DEFAULT false,
        "payout_amount_stroops" bigint NOT NULL DEFAULT '0',
        "tx_hash" character varying,
        "submitted_at" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid,
        "marketId" uuid,
        CONSTRAINT "PK_predictions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prediction_user_market" UNIQUE ("userId", "marketId"),
        CONSTRAINT "FK_predictions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_predictions_market" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_predictions_userId" ON "predictions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_predictions_marketId" ON "predictions" ("marketId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_predictions_marketId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_predictions_userId"`);
    await queryRunner.query(`DROP TABLE "predictions"`);
  }
}
