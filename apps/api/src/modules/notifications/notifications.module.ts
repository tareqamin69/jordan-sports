import { Global, Module } from '@nestjs/common';
import { ConsoleNotificationChannel, NOTIFICATION_CHANNEL } from './application/channels.js';
import { OutboxDispatcher } from './application/dispatcher.service.js';

@Global()
@Module({
  providers: [
    // Only the console channel exists until an SMS/WhatsApp provider is chosen.
    { provide: NOTIFICATION_CHANNEL, useValue: new ConsoleNotificationChannel() },
    OutboxDispatcher,
  ],
  exports: [OutboxDispatcher, NOTIFICATION_CHANNEL],
})
export class NotificationsModule {}
