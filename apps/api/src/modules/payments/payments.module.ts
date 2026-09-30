import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../platform/config/config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { PaymentsService } from './application/payments.service.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from './domain/gateway.js';
import { AdminPaymentsController } from './http/admin-payments.controller.js';
import { MockGatewayController } from './http/mock-gateway.controller.js';
import { MockGateway } from './infrastructure/mock-gateway.js';

/** Card payments (ADR-0020): the gateway chosen by PAYMENT_GATEWAY, transactions and refunds. */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [APP_CONFIG, REDIS],
      useFactory: (config: AppConfig, redis: Redis): PaymentGateway => {
        switch (config.paymentGateway) {
          case 'mock':
            return new MockGateway(redis);
        }
      },
    },
    PaymentsService,
  ],
  controllers: [MockGatewayController, AdminPaymentsController],
  exports: [PaymentsService, PAYMENT_GATEWAY],
})
export class PaymentsModule {}
