import { forwardRef, Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { BroadcasterService } from './broadcaster.service';
import { NotificationBroadcasterService } from './notification-broadcaster.service';

@Module({
  imports: [
    forwardRef(() => AnalyticsModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    EventsGateway,
    BroadcasterService,
    NotificationBroadcasterService,
  ],
  exports: [BroadcasterService, NotificationBroadcasterService],
})
export class WebsocketModule {}
