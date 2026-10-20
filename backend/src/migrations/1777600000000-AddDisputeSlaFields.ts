import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class AddDisputeSlaFields1777600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('disputes', [
      new TableColumn({
        name: 'sla_stage',
        type: 'varchar',
        length: '20',
        default: "'initial_review'",
        isNullable: false,
      }),
      new TableColumn({
        name: 'sla_deadline',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'sla_breached_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'sla_approaching_notified_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'sla_breached_notified_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'assigned_arbiter_id',
        type: 'uuid',
        isNullable: true,
      }),
    ]);

    // Backfill existing pending disputes with a deadline so the SLA sweep
    // has something to compare against, then make the column mandatory for
    // new rows going forward via the entity/application layer.
    await queryRunner.query(
      `UPDATE "disputes" SET "sla_deadline" = "created_at" + INTERVAL '48 hours' WHERE "sla_deadline" IS NULL`,
    );

    await queryRunner.changeColumn(
      'disputes',
      'sla_deadline',
      new TableColumn({
        name: 'sla_deadline',
        type: 'timestamptz',
        isNullable: false,
      }),
    );

    await queryRunner.createIndex(
      'disputes',
      new TableIndex({
        name: 'IDX_disputes_sla_stage',
        columnNames: ['sla_stage'],
      }),
    );

    await queryRunner.createIndex(
      'disputes',
      new TableIndex({
        name: 'IDX_disputes_assigned_arbiter_id',
        columnNames: ['assigned_arbiter_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'disputes',
      new TableForeignKey({
        name: 'FK_disputes_assigned_arbiter_id',
        columnNames: ['assigned_arbiter_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'disputes',
      'FK_disputes_assigned_arbiter_id',
    );
    await queryRunner.dropIndex('disputes', 'IDX_disputes_assigned_arbiter_id');
    await queryRunner.dropIndex('disputes', 'IDX_disputes_sla_stage');
    await queryRunner.dropColumns('disputes', [
      'assigned_arbiter_id',
      'sla_breached_notified_at',
      'sla_approaching_notified_at',
      'sla_breached_at',
      'sla_deadline',
      'sla_stage',
    ]);
  }
}
