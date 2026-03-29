import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompetitionEntity1774500001000 implements MigrationInterface {
  name = 'CreateCompetitionEntity1774500001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."competitions_visibility_enum" AS ENUM('public', 'private')
    `);

    await queryRunner.query(`
      CREATE TABLE "competitions" (
        "id"                  uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "title"               character varying NOT NULL,
        "description"         text              NOT NULL,
        "start_time"          TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_time"            TIMESTAMP WITH TIME ZONE NOT NULL,
        "prize_pool_stroops"  bigint            NOT NULL DEFAULT 0,
        "max_participants"    integer           NOT NULL DEFAULT 0,
        "participant_count"   integer           NOT NULL DEFAULT 0,
        "is_finalized"        boolean           NOT NULL DEFAULT false,
        "visibility"          "public"."competitions_visibility_enum" NOT NULL DEFAULT 'public',
        "invite_code"         character varying,
        "creator_id"          uuid,
        "created_at"          TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_competitions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_competitions_invite_code_unique_when_set"
      ON "competitions" ("invite_code")
      WHERE "invite_code" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "competitions"
        ADD CONSTRAINT "FK_competitions_creator"
        FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitions" DROP CONSTRAINT "FK_competitions_creator"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_competitions_invite_code_unique_when_set"`,
    );
    await queryRunner.query(`DROP TABLE "competitions"`);
    await queryRunner.query(
      `DROP TYPE "public"."competitions_visibility_enum"`,
    );
  }
}
