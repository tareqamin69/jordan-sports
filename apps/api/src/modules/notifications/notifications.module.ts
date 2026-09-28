import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '../../platform/config/config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';
import { ReleansClient } from '../../platform/sms/releans.js';
import {
  ConsoleNotificationChannel,
  NOTIFICATION_CHANNEL,
  ReleansNotificationChannel,
  type NotificationChannel,
} from './application/channels.js';
import { OutboxDispatcher } from './application/dispatcher.service.js';

@Global()
@Module({
  providers: [
    {
      provide: NOTIFICATION_CHANNEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): NotificationChannel =>
        config.releans
          ? new ReleansNotificationChannel(new ReleansClient(config.releans))
          : new ConsoleNotificationChannel(),
    },
    OutboxDispatcher,
  ],
  exports: [OutboxDispatcher, NOTIFICATION_CHANNEL],
})
export class NotificationsModule {}
