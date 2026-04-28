import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AchievementType {
  FIRST_PREDICTION = 'first_prediction',
  CORRECT_PREDICTIONS_10 = 'correct_predictions_10',
  CORRECT_PREDICTIONS_50 = 'correct_predictions_50',
  CORRECT_PREDICTIONS_100 = 'correct_predictions_100',
  ACCURACY_75 = 'accuracy_75',
  ACCURACY_90 = 'accuracy_90',
  TOTAL_STAKED_1M = 'total_staked_1m',
  TOTAL_STAKED_10M = 'total_staked_10m',
  REPUTATION_500 = 'reputation_500',
  REPUTATION_1000 = 'reputation_1000',
}

@Entity('achievements')
@Index(['type'])
export class Achievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AchievementType })
  type: AchievementType;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  icon_url: string;

  @Column({ default: 0 })
  reward_points: number;

  @CreateDateColumn()
  created_at: Date;
}
