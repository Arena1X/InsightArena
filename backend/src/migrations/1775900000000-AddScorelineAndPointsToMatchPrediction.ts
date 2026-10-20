import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddScorelineAndPointsToMatchPrediction1775900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('match_predictions', [
      new TableColumn({
        name: 'predicted_home_score',
        type: 'int',
        isNullable: true,
      }),
      new TableColumn({
        name: 'predicted_away_score',
        type: 'int',
        isNullable: true,
      }),
      new TableColumn({
        name: 'points_earned',
        type: 'int',
        default: 0,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('match_predictions', 'points_earned');
    await queryRunner.dropColumn('match_predictions', 'predicted_away_score');
    await queryRunner.dropColumn('match_predictions', 'predicted_home_score');
  }
}
