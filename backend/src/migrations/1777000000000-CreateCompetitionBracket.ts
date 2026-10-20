import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompetitionBracket1777000000000 implements MigrationInterface {
  name = 'CreateCompetitionBracket1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "competition_brackets_status_enum" AS ENUM (
        'pending', 'in_progress', 'completed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "competition_brackets" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "competition_id" uuid NOT NULL,
        "total_rounds" integer NOT NULL,
        "status" "competition_brackets_status_enum" NOT NULL DEFAULT 'pending',
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_competition_brackets_competition"
          FOREIGN KEY ("competition_id")
          REFERENCES "competitions"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_competition_brackets_competition_id"
        ON "competition_brackets" ("competition_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "bracket_rounds" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "bracket_id" uuid NOT NULL,
        "round_number" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        CONSTRAINT "FK_bracket_rounds_bracket"
          FOREIGN KEY ("bracket_id")
          REFERENCES "competition_brackets"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_bracket_rounds_bracket_round"
        ON "bracket_rounds" ("bracket_id", "round_number")
    `);

    await queryRunner.query(`
      CREATE TABLE "bracket_matchups" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "round_id" uuid NOT NULL,
        "match_number" integer NOT NULL,
        "participant_1_id" uuid,
        "participant_2_id" uuid,
        "winner_id" uuid,
        "is_bye" boolean NOT NULL DEFAULT false,
        CONSTRAINT "FK_bracket_matchups_round"
          FOREIGN KEY ("round_id")
          REFERENCES "bracket_rounds"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_bracket_matchups_participant_1"
          FOREIGN KEY ("participant_1_id")
          REFERENCES "competition_participants"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_bracket_matchups_participant_2"
          FOREIGN KEY ("participant_2_id")
          REFERENCES "competition_participants"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_bracket_matchups_winner"
          FOREIGN KEY ("winner_id")
          REFERENCES "competition_participants"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_bracket_matchups_round_match"
        ON "bracket_matchups" ("round_id", "match_number")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bracket_matchups_round_match"`);
    await queryRunner.query(`DROP TABLE "bracket_matchups"`);
    await queryRunner.query(`DROP INDEX "IDX_bracket_rounds_bracket_round"`);
    await queryRunner.query(`DROP TABLE "bracket_rounds"`);
    await queryRunner.query(
      `DROP INDEX "IDX_competition_brackets_competition_id"`,
    );
    await queryRunner.query(`DROP TABLE "competition_brackets"`);
    await queryRunner.query(`DROP TYPE "competition_brackets_status_enum"`);
  }
}
