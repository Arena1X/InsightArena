import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFlagEntity1774670001000 implements MigrationInterface {
  name = 'CreateFlagEntity1774670001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "flags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "market_id" uuid NOT NULL, "user_id" uuid NOT NULL, "reason" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "description" text, "resolution_action" character varying, "admin_notes" text, "resolved_by" uuid, "resolved_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f8a1c3e4b2d6a7f8c9e0d1a2b3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_flags_market_id" ON "flags" ("market_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_flags_user_id" ON "flags" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_flags_status" ON "flags" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_flags_reason" ON "flags" ("reason")`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "FK_flags_market_id" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "FK_flags_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "FK_flags_resolved_by" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flags" DROP CONSTRAINT "FK_flags_resolved_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" DROP CONSTRAINT "FK_flags_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" DROP CONSTRAINT "FK_flags_market_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_flags_reason"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_flags_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_flags_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_flags_market_id"`);
    await queryRunner.query(`DROP TABLE "flags"`);
  }
}
