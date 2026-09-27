import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, PinoNestLogger } from '../../src/platform/logging/logger.js';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, logger: createLogger({ logLevel: 'trace' }, stream) };
}

describe('logger', () => {
  it('writes structured JSON with an ISO timestamp and service name', () => {
    const { lines, logger } = capture();
    logger.info('hello');
    expect(lines[0]).toMatchObject({ msg: 'hello', service: 'api', level: 30 });
    expect(String(lines[0]?.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts credentials and personal data', () => {
    const { lines, logger } = capture();
    logger.info({
      req: { headers: { authorization: 'Bearer abc', cookie: 'sid=abc', accept: 'text/html' } },
      user: { phone: '+962790000000', email: 'player@example.com', name: 'Visible' },
      otpChallenge: { otp: '123456' },
      config: { databaseUrl: 'postgres://u:p@h/db' },
    });
    const line = JSON.stringify(lines[0]);
    for (const secret of [
      'Bearer abc',
      'sid=abc',
      '+962790000000',
      'player@example.com',
      '123456',
      'u:p@h',
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain('text/html');
    expect(line).toContain('Visible');
  });

  it('adapts Nest log calls, keeping the context', () => {
    const { lines, logger } = capture();
    const nest = new PinoNestLogger(logger);
    nest.log('started', 'Bootstrap');
    nest.error(new Error('boom'), 'Database');
    expect(lines[0]).toMatchObject({ msg: 'started', context: 'Bootstrap', level: 30 });
    expect(lines[1]).toMatchObject({ msg: 'boom', context: 'Database', level: 50 });
  });
});
