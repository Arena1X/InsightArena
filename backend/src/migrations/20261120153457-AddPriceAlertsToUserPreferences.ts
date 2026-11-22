import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPriceAlertsToUserPreferences20261120153457
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'user_preferences',
      new TableColumn({
        name: 'price_alerts',
        type: 'jsonb',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('user_preferences', 'price_alerts');
  }
}
