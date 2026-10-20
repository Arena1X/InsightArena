import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddScoreAndMultiplierToMatch1775800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('event_matches', [
      new TableColumn({
        name: 'home_score',
        type: 'int',
        isNullable: true,
      }),
      new TableColumn({
        name: 'away_score',
        type: 'int',
        isNullable: true,
      }),
      new TableColumn({
        name: 'points_multiplier',
        type: 'int',
        default: 1,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('event_matches', 'points_multiplier');
    await queryRunner.dropColumn('event_matches', 'away_score');
    await queryRunner.dropColumn('event_matches', 'home_score');
  }
}
