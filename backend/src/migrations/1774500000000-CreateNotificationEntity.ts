import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationEntity1774500000000 implements MigrationInterface {
  name = 'CreateNotificationEntity1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."notifications_type_enum" AS ENUM(
        'competition_started',
        'competition_ended',
        'leaderboard_updated',
        'market_resolved',
        'system'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid              NOT NULL,
        "type"       "public"."notifications_type_enum" NOT NULL,
        "title"      character varying NOT NULL,
        "message"    text              NOT NULL,
        "is_read"    boolean           NOT NULL DEFAULT false,
        "metadata"   jsonb,
        "created_at" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_user_id_is_read" ON "notifications" ("user_id", "is_read")
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD CONSTRAINT "FK_notifications_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_user"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_id_is_read"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_id"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
  }
}
