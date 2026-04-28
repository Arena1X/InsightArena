import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([Market, User, Competition])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
