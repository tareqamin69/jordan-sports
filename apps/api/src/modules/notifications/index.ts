export { NotificationsModule } from './notifications.module.js';
export { OutboxDispatcher } from './application/dispatcher.service.js';
export { enqueue, type OutboxEvent } from './application/outbox.js';
export {
  ConsoleNotificationChannel,
  NOTIFICATION_CHANNEL,
  type NotificationChannel,
} from './application/channels.js';
export { renderBookingMessage } from './domain/templates.js';
