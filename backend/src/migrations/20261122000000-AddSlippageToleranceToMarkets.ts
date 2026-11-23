import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSlippageToleranceToMarkets20261122000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'markets',
      new TableColumn({
        name: 'slippage_tolerance_bps',
        type: 'int',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('markets', 'slippage_tolerance_bps');
  }
}
