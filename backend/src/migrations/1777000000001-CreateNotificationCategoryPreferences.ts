import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationCategoryPreferences1777000000001 implements MigrationInterface {
  name = 'CreateNotificationCategoryPreferences1777000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_category_preferences_category_enum" AS ENUM (
        'event_created',
        'match_added',
        'prediction_submitted',
        'match_resolved',
        'winner_verified',
        'event_cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_category_preferences" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "category" "notification_category_preferences_category_enum" NOT NULL,
        "in_app" boolean NOT NULL DEFAULT true,
        "email" boolean NOT NULL DEFAULT true,
        "push" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_notification_category_user_category" UNIQUE ("userId", "category")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_category_preferences_userId"
        ON "notification_category_preferences" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_category_preferences_category"
        ON "notification_category_preferences" ("category")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_notification_category_preferences_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_notification_category_preferences_userId"`,
    );
    await queryRunner.query(`DROP TABLE "notification_category_preferences"`);
    await queryRunner.query(
      `DROP TYPE "notification_category_preferences_category_enum"`,
    );
  }
}
