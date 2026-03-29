import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateMarketTemplatesTable1774900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'market_templates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'title',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'category',
            type: 'varchar',
          },
          {
            name: 'outcome_options',
            type: 'text',
          },
          {
            name: 'suggested_duration_days',
            type: 'integer',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Seed some initial template data
    const templates = [
      {
        title: 'Sports Match Result',
        description: 'Predict the winner of an upcoming sports match.',
        category: 'Sports',
        outcome_options: 'Team A,Team B,Draw',
        suggested_duration_days: 7,
      },
      {
        title: 'Election Outcome',
        description: 'Predict the winner of a political election.',
        category: 'Politics',
        outcome_options: 'Candidate X,Candidate Y,Other',
        suggested_duration_days: 30,
      },
      {
        title: 'Crypto Price Prediction',
        description: 'Predict if a cryptocurrency will reach a certain price.',
        category: 'Crypto',
        outcome_options: 'Yes,No',
        suggested_duration_days: 14,
      },
      {
        title: 'Entertainment Awards',
        description: 'Predict the winner of an award show category.',
        category: 'Entertainment',
        outcome_options: 'Nominee 1,Nominee 2,Nominee 3,Other',
        suggested_duration_days: 21,
      },
    ];

    for (const t of templates) {
      await queryRunner.query(
        `INSERT INTO market_templates (title, description, category, outcome_options, suggested_duration_days) VALUES ($1, $2, $3, $4, $5)`,
        [
          t.title,
          t.description,
          t.category,
          t.outcome_options,
          t.suggested_duration_days,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('market_templates');
  }
}
