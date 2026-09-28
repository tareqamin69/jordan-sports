import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '../../platform/config/config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';
import {
  ConsoleEmailSender,
  EMAIL_SENDER,
  SmtpEmailSender,
  type EmailSender,
} from '../../platform/email/email-sender.js';
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
    {
      provide: EMAIL_SENDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): EmailSender =>
        config.email.smtpUrl
          ? new SmtpEmailSender(config.email.smtpUrl, config.email.from)
          : new ConsoleEmailSender(),
    },
    OutboxDispatcher,
  ],
  exports: [OutboxDispatcher, NOTIFICATION_CHANNEL, EMAIL_SENDER],
})
export class NotificationsModule {}
