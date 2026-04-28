import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserPreferencesTable1775300000000 implements MigrationInterface {
  name = 'CreateUserPreferencesTable1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "email_notifications" boolean NOT NULL DEFAULT true, "market_resolution_notifications" boolean NOT NULL DEFAULT true, "competition_notifications" boolean NOT NULL DEFAULT true, "leaderboard_notifications" boolean NOT NULL DEFAULT true, "marketing_emails" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_user_preferences_user_id" UNIQUE ("user_id"), CONSTRAINT "PK_user_preferences_id" PRIMARY KEY ("id"), CONSTRAINT "FK_user_preferences_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_preferences_user_id" ON "user_preferences" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_preferences_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "user_preferences"`);
  }
}
