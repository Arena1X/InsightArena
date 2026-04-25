import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { User } from './user.entity'; // Adjust the import as necessary

@Entity()
export class MarketInviteCode {
    @PrimaryGeneratedColumn('uuid')
    id: string;
   
    @Index()
    @Column()
    market_id: string;
    
    @Index({ unique: true })
    @Column()
    code: string;
    
    @Column({ type: 'int' })
    max_uses: number;
    
    @Column({ type: 'int' })
    current_uses: number;
    
    @Column({ default: true })
    is_active: boolean;
    
    @Column({ type: 'timestamp', nullable: true })
    expires_at: Date;
    
    @ManyToOne(() => User, user => user.marketInviteCodes)
    creator: User;
    
    @CreateDateColumn()
    created_at: Date;
}