import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationCategory {
  EventCreated = 'event_created',
  MatchAdded = 'match_added',
  PredictionSubmitted = 'prediction_submitted',
  MatchResolved = 'match_resolved',
  WinnerVerified = 'winner_verified',
  EventCancelled = 'event_cancelled',
}

@Entity('notification_category_preferences')
@Index(['userId', 'category'], { unique: true })
export class NotificationCategoryPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'varchar',
    enum: NotificationCategory,
  })
  category: NotificationCategory;

  @Column({ type: 'boolean', default: true })
  in_app: boolean;

  @Column({ type: 'boolean', default: true })
  email: boolean;

  @Column({ type: 'boolean', default: false })
  push: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
