import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDisputeStatusToMatches1787800000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'event_matches',
      new TableColumn({
        name: 'dispute_status',
        type: 'enum',
        enum: ['DISPUTED_SOURCE'],
        isNullable: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('event_matches', 'dispute_status');
  }
}
