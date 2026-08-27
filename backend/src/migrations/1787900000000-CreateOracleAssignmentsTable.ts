import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOracleAssignmentsTable1787900000000
  implements MigrationInterface
{
  name = 'CreateOracleAssignmentsTable1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "oracle_assignments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "data_source" varchar(500) NOT NULL,
        "event_id" uuid NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_oracle_assignments_source_event" UNIQUE ("data_source", "event_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_assignments_data_source" ON "oracle_assignments" ("data_source")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_oracle_assignments_event_id" ON "oracle_assignments" ("event_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_oracle_assignments_event_id"`);
    await queryRunner.query(`DROP INDEX "IDX_oracle_assignments_data_source"`);
    await queryRunner.query(`DROP TABLE "oracle_assignments"`);
  }
}
