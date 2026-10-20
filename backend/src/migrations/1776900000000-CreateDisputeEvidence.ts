import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateDisputeEvidence1776900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'dispute_evidence',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'dispute_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'uploaded_by_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'file_url',
            type: 'varchar',
            length: '2048',
            isNullable: false,
          },
          {
            name: 'file_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'mime_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'size_bytes',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
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
      'dispute_evidence',
      new TableIndex({
        name: 'IDX_dispute_evidence_dispute_id',
        columnNames: ['dispute_id'],
      }),
    );

    await queryRunner.createIndex(
      'dispute_evidence',
      new TableIndex({
        name: 'IDX_dispute_evidence_uploaded_by_id',
        columnNames: ['uploaded_by_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'dispute_evidence',
      new TableForeignKey({
        name: 'FK_dispute_evidence_dispute',
        columnNames: ['dispute_id'],
        referencedTableName: 'disputes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'dispute_evidence',
      new TableForeignKey({
        name: 'FK_dispute_evidence_uploaded_by',
        columnNames: ['uploaded_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'dispute_evidence',
      'FK_dispute_evidence_uploaded_by',
    );
    await queryRunner.dropForeignKey(
      'dispute_evidence',
      'FK_dispute_evidence_dispute',
    );
    await queryRunner.dropTable('dispute_evidence');
  }
}
