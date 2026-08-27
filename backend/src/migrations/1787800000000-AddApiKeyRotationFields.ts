import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddApiKeyRotationFields1787800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('api_keys', [
      new TableColumn({
        name: 'rotated_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'grace_expires_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'replaced_by_id',
        type: 'uuid',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('api_keys', 'replaced_by_id');
    await queryRunner.dropColumn('api_keys', 'grace_expires_at');
    await queryRunner.dropColumn('api_keys', 'rotated_at');
  }
}
