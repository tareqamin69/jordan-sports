import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/platform/database/database.js';
import { transaction } from '../../src/platform/database/transaction.js';

function fakeDb(failures: string[]): { db: Db; calls: () => number } {
  let calls = 0;
  const db = {
    transaction: () => ({
      execute: async (fn: (tx: unknown) => Promise<unknown>) => {
        calls++;
        const code = failures.shift();
        if (code) throw Object.assign(new Error(code), { code });
        return fn({});
      },
    }),
  } as unknown as Db;
  return { db, calls: () => calls };
}

describe('transaction retry', () => {
  it('retries deadlocks and serialization failures', async () => {
    const { db, calls } = fakeDb(['40P01', '40001']);
    await expect(transaction(db, async () => 'done')).resolves.toBe('done');
    expect(calls()).toBe(3);
  });

  it('never retries exclusion violations or other errors', async () => {
    for (const code of ['23P01', '23505', undefined]) {
      const { db, calls } = fakeDb([code ?? 'XX000']);
      await expect(transaction(db, async () => 'done')).rejects.toThrow();
      expect(calls()).toBe(1);
    }
  });

  it('gives up after the retry budget', async () => {
    const { db, calls } = fakeDb(['40P01', '40P01', '40P01', '40P01', '40P01']);
    await expect(transaction(db, async () => 'done', 3)).rejects.toThrow('40P01');
    expect(calls()).toBe(4);
  });
});
