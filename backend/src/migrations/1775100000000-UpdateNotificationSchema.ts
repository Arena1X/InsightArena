import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateNotificationSchema1775100000000 implements MigrationInterface {
  name = 'UpdateNotificationSchema1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing foreign key and indexes
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_user"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_id_is_read"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_id"`);

    // Drop the enum type
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);

    // Drop and recreate the table with new schema
    await queryRunner.query(`DROP TABLE "notifications"`);

    // Create new notifications table with bigint id and user_address
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"           bigserial        NOT NULL,
        "user_address" character varying NOT NULL,
        "type"         character varying NOT NULL,
        "title"        character varying NOT NULL,
        "message"      text              NOT NULL,
        "data"         jsonb,
        "read"         boolean           NOT NULL DEFAULT false,
        "created_at"   TIMESTAMP         NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMP,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);

    // Create indexes as per requirements
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_address" ON "notifications" ("user_address")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_type" ON "notifications" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_read" ON "notifications" ("read")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_created_at" ON "notifications" ("created_at")`,
    );
    // Composite index on (user_address, read, created_at)
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_address_read_created_at" ON "notifications" ("user_address", "read", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_notifications_user_address_read_created_at"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_notifications_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_read"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_type"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_address"`);
    await queryRunner.query(`DROP TABLE "notifications"`);

    // Recreate old schema
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

    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_id_is_read" ON "notifications" ("user_id", "is_read")`,
    );

    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD CONSTRAINT "FK_notifications_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }
}
