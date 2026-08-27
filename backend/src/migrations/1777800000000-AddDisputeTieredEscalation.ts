import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

/**
 * Adds tiered, reputation-weighted escalation to disputes:
 *  - `tier`, `quorum_threshold`, and a self-referencing `escalated_from_id`
 *    on the `disputes` table;
 *  - a `dispute_votes` table holding one reputation-weighted vote per address
 *    per dispute.
 */
export class AddDisputeTieredEscalation1777800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('disputes', [
      new TableColumn({
        name: 'tier',
        type: 'int',
        default: 1,
        isNullable: false,
      }),
      new TableColumn({
        name: 'quorum_threshold',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'escalated_from_id',
        type: 'uuid',
        isNullable: true,
      }),
    ]);

    await queryRunner.createIndex(
      'disputes',
      new TableIndex({
        name: 'IDX_disputes_tier',
        columnNames: ['tier'],
      }),
    );

    await queryRunner.createIndex(
      'disputes',
      new TableIndex({
        name: 'IDX_disputes_escalated_from_id',
        columnNames: ['escalated_from_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'disputes',
      new TableForeignKey({
        name: 'FK_disputes_escalated_from_id',
        columnNames: ['escalated_from_id'],
        referencedTableName: 'disputes',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'dispute_votes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'dispute_id', type: 'uuid', isNullable: false },
          { name: 'voter_id', type: 'uuid', isNullable: false },
          { name: 'voter_address', type: 'varchar', isNullable: false },
          { name: 'outcome', type: 'varchar', length: '20', isNullable: false },
          { name: 'weight', type: 'int', default: 0, isNullable: false },
          { name: 'tier', type: 'int', default: 1, isNullable: false },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'dispute_votes',
      new TableIndex({
        name: 'IDX_dispute_votes_dispute_id',
        columnNames: ['dispute_id'],
      }),
    );

    await queryRunner.createIndex(
      'dispute_votes',
      new TableIndex({
        name: 'IDX_dispute_votes_voter_address',
        columnNames: ['voter_address'],
      }),
    );

    await queryRunner.createIndex(
      'dispute_votes',
      new TableIndex({
        name: 'UQ_dispute_votes_dispute_address',
        columnNames: ['dispute_id', 'voter_address'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'dispute_votes',
      new TableForeignKey({
        name: 'FK_dispute_votes_dispute_id',
        columnNames: ['dispute_id'],
        referencedTableName: 'disputes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'dispute_votes',
      new TableForeignKey({
        name: 'FK_dispute_votes_voter_id',
        columnNames: ['voter_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('dispute_votes', true);

    await queryRunner.dropForeignKey(
      'disputes',
      'FK_disputes_escalated_from_id',
    );
    await queryRunner.dropIndex('disputes', 'IDX_disputes_escalated_from_id');
    await queryRunner.dropIndex('disputes', 'IDX_disputes_tier');
    await queryRunner.dropColumns('disputes', [
      'escalated_from_id',
      'quorum_threshold',
      'tier',
    ]);
  }
}
