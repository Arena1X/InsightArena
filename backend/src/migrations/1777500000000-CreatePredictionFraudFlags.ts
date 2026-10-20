import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreatePredictionFraudFlags1777500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'prediction_fraud_flags',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'signal_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'score',
            type: 'double precision',
            isNullable: false,
          },
          {
            name: 'threshold',
            type: 'double precision',
            isNullable: false,
          },
          {
            name: 'details',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'open'",
            isNullable: false,
          },
          {
            name: 'reviewed_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'reviewed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'prediction_fraud_flags',
      new TableIndex({
        name: 'IDX_prediction_fraud_flags_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'prediction_fraud_flags',
      new TableIndex({
        name: 'IDX_prediction_fraud_flags_signal_type',
        columnNames: ['signal_type'],
      }),
    );

    await queryRunner.createIndex(
      'prediction_fraud_flags',
      new TableIndex({
        name: 'IDX_prediction_fraud_flags_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createForeignKey(
      'prediction_fraud_flags',
      new TableForeignKey({
        name: 'FK_prediction_fraud_flags_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'prediction_fraud_flags',
      'FK_prediction_fraud_flags_user',
    );
    await queryRunner.dropTable('prediction_fraud_flags');
  }
}
