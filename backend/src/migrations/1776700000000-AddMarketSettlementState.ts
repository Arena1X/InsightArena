import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketSettlementState1776700000000 implements MigrationInterface {
  name = 'AddMarketSettlementState1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."market_settlement_state" AS ENUM('pending', 'proposed', 'challenged', 'settled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" ADD "settlement_state" "public"."market_settlement_state" NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" ADD "proposed_outcome" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" ADD "resolution_proposed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" ADD "grace_period_seconds" integer NOT NULL DEFAULT 86400`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_markets_settlement_state" ON "markets" ("settlement_state")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_markets_settlement_state"`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" DROP COLUMN "grace_period_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" DROP COLUMN "resolution_proposed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" DROP COLUMN "proposed_outcome"`,
    );
    await queryRunner.query(
      `ALTER TABLE "markets" DROP COLUMN "settlement_state"`,
    );
    await queryRunner.query(`DROP TYPE "public"."market_settlement_state"`);
  }
}
