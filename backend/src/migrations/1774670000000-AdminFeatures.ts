import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminFeatures1774670000000 implements MigrationInterface {
  name = 'AdminFeatures1774670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to users table
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_banned" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "ban_reason" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "banned_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "users" ADD "banned_by" uuid`);

    // Create activity_logs table
    await queryRunner.query(
      `CREATE TABLE "activity_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "actionType" character varying NOT NULL, "actionDetails" jsonb, "ipAddress" character varying, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_activity_logs_id" PRIMARY KEY ("id"))`,
    );

    // Add foreign key constraint (optional but recommended)
    await queryRunner.query(
      `ALTER TABLE "activity_logs" ADD CONSTRAINT "FK_activity_logs_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Create admin_audit_logs table - audit trail for administrative state
    // changes (bans, role updates, market resolution/featuring and feature
    // flag toggles). Every entry records the acting admin, the target
    // resource, a JSON payload (including before/after diffs) and the time
    // of the change.
    await queryRunner.query(
      `CREATE TABLE "admin_audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" character varying(255) NOT NULL, "action" character varying(100) NOT NULL, "target_type" character varying(100), "target_id" character varying(255), "metadata" jsonb, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_admin_audit_logs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_actor_id" ON "admin_audit_logs" ("actor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_action" ON "admin_audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_actor_id"`);
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
    await queryRunner.query(
      `ALTER TABLE "activity_logs" DROP CONSTRAINT "FK_activity_logs_userId"`,
    );
    await queryRunner.query(`DROP TABLE "activity_logs"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "banned_by"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "banned_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "ban_reason"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_banned"`);
  }
}
