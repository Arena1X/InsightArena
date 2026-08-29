import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSettlementAttemptCountToMarkets1787900100000 implements MigrationInterface {
  name = 'AddSettlementAttemptCountToMarkets1787900100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'markets',
      new TableColumn({
        name: 'settlement_attempt_count',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('markets', 'settlement_attempt_count');
  }
}
