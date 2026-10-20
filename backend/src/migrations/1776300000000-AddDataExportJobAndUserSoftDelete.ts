import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataExportJobAndUserSoftDelete1776300000000 implements MigrationInterface {
  name = 'AddDataExportJobAndUserSoftDelete1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP`,
    );

    await queryRunner.query(`
      CREATE TABLE "data_export_jobs" (
        "id"         uuid                        NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid                        NOT NULL,
        "status"     character varying           NOT NULL DEFAULT 'pending',
        "file_path"  character varying,
        "expires_at" TIMESTAMP,
        "created_at" TIMESTAMP                   NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_data_export_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_data_export_jobs_user_id" ON "data_export_jobs" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_data_export_jobs_status" ON "data_export_jobs" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_data_export_jobs_expires_at" ON "data_export_jobs" ("expires_at")
       WHERE expires_at IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_data_export_jobs_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_data_export_jobs_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_data_export_jobs_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "data_export_jobs"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
  }
}
