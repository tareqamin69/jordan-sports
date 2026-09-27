import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { LifecycleService } from '../modules/bookings/index.js';
import { OutboxDispatcher } from '../modules/notifications/index.js';

interface Job {
  readonly name: string;
  readonly everyMs: number;
  readonly run: () => Promise<number>;
}

/**
 * Runs periodic jobs. Each job never overlaps itself; all jobs are idempotent and safe to run in
 * several worker processes at once (row locks / SKIP LOCKED).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<Promise<unknown>>();
  lastSuccessAt: Date | null = null;

  constructor(
    private readonly lifecycle: LifecycleService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  private readonly jobs: Job[] = [
    { name: 'outbox', everyMs: 2_000, run: () => this.outbox.dispatchOnce() },
    { name: 'expire-holds', everyMs: 15_000, run: () => this.lifecycle.expireHolds() },
    { name: 'complete-bookings', everyMs: 60_000, run: () => this.lifecycle.completeFinished() },
  ];

  onApplicationBootstrap(): void {
    for (const job of this.jobs) {
      let busy = false;
      const tick = () => {
        if (busy) return;
        busy = true;
        const p = job
          .run()
          .then((count) => {
            this.lastSuccessAt = new Date();
            if (count > 0) this.logger.log(`${job.name}: ${count}`);
          })
          .catch((error: unknown) => this.logger.error(`${job.name} failed`, error as Error))
          .finally(() => {
            busy = false;
            this.running.delete(p);
          });
        this.running.add(p);
      };
      tick();
      this.timers.push(setInterval(tick, job.everyMs));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    await Promise.allSettled([...this.running]);
  }
}
