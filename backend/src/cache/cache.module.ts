import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';

@Module({
  imports: [NestCacheModule.register()],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheServiceModule {}
