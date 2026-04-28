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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
