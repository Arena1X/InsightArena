import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { CacheInvalidationService } from './cache-invalidation.service';

@Module({
  imports: [NestCacheModule.register()],
  providers: [CacheInvalidationService],
  exports: [CacheInvalidationService],
})
export class CacheModule {}
