import { createServer, type IncomingMessage, type Server } from 'node:http';

export interface FakeRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  form: Record<string, string>;
}

/** A local stand-in for the Releans API (the sandbox for tests): records requests, answers as told. */
export class FakeReleans {
  readonly requests: FakeRequest[] = [];
  /** Next answers, consumed in order; when empty a 201 success is returned. */
  readonly script: Array<{ status: number; body?: unknown; delayMs?: number }> = [];
  private server: Server | undefined;
  baseUrl = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('no address');
    this.baseUrl = `http://127.0.0.1:${address.port}/v2`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: import('node:http').ServerResponse) {
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    this.requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      authorization: req.headers.authorization,
      form: Object.fromEntries(new URLSearchParams(raw)),
    });
    const next = this.script.shift() ?? {
      status: 201,
      body: { status: 201, message: 'Message created' },
    };
    if (next.delayMs) await new Promise((r) => setTimeout(r, next.delayMs));
    res.writeHead(next.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(next.body ?? {}));
  }
}
