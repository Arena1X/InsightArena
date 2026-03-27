import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Season } from './entities/season.entity';

@Injectable()
export class SeasonsService {
  constructor(
    @InjectRepository(Season)
    private readonly seasonsRepository: Repository<Season>,
  ) {}

  async findAll(): Promise<Season[]> {
    return this.seasonsRepository.find({
      order: {
        starts_at: 'DESC',
      },
    });
  }
}
