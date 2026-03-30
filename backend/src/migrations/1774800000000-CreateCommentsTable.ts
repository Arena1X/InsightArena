import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateCommentsTable1774800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'comments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'authorId',
            type: 'uuid',
          },
          {
            name: 'marketId',
            type: 'uuid',
          },
          {
            name: 'parentId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'is_moderated',
            type: 'boolean',
            default: false,
          },
          {
            name: 'moderation_reason',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('comments', [
      new TableForeignKey({
        columnNames: ['authorId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['marketId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'markets',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['parentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'comments',
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createIndices('comments', [
      new TableIndex({
        name: 'IDX_COMMENTS_AUTHOR',
        columnNames: ['authorId'],
      }),
      new TableIndex({
        name: 'IDX_COMMENTS_MARKET',
        columnNames: ['marketId'],
      }),
      new TableIndex({
        name: 'IDX_COMMENTS_PARENT',
        columnNames: ['parentId'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('comments');
  }
}
