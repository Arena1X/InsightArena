import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMaxRetryLimitToWebhookDeliveryLog1734567890123
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'webhook_delivery_logs',
      new TableColumn({
        name: 'max_retry_limit',
        type: 'int',
        isNullable: true,
        comment:
          'Per-delivery maximum retry attempts (overrides global defaults)',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('webhook_delivery_logs', 'max_retry_limit');
  }
}
