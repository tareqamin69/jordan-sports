/**
 * Releans SMS gateway client (ADR-0019). Built against Releans' documented "send message" call
 * (POST {base}/message, bearer token, form fields senderId / mobileNumber / message) and tested
 * against a local fake server; the exact request and response shapes must be confirmed with the
 * real sandbox before switching on (docs/launch-checklist.md).
 */

export class SmsDeliveryError extends Error {
  override readonly name = 'SmsDeliveryError';
  constructor(
    message: string,
    /** True when retrying later may succeed (network, timeout, 5xx, 429). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ReleansOptions {
  readonly apiKey: string;
  readonly senderId: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  /** Injectable for tests. */
  readonly fetch?: typeof fetch;
}

/** Digits with the country code and no "+" (e.g. `962791234567`). */
export function toGatewayNumber(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(digits)) throw new SmsDeliveryError('Invalid phone number', false);
  return digits;
}

/** Keeps logs useful without storing whole numbers. */
export function maskPhone(phone: string): string {
  return phone.length <= 6 ? '***' : `${phone.slice(0, 5)}…${phone.slice(-2)}`;
}

export class ReleansClient {
  private readonly send_: typeof fetch;

  constructor(private readonly options: ReleansOptions) {
    this.send_ = options.fetch ?? fetch;
  }

  /** Sends one message. Never includes the message text (it may hold a code) in an error. */
  async send(to: string, text: string): Promise<void> {
    const mobileNumber = toGatewayNumber(to);
    let response: Response;
    try {
      response = await this.send_(`${this.options.baseUrl.replace(/\/$/, '')}/message`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          senderId: this.options.senderId,
          mobileNumber,
          message: text,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new SmsDeliveryError(
        timedOut ? 'Releans request timed out' : 'Releans request failed',
        true,
      );
    }
    const status = response.status;
    if (!response.ok) {
      // 401/403: wrong key or sender not approved; 4xx otherwise: bad request. Retrying won't help.
      throw new SmsDeliveryError(
        `Releans answered HTTP ${status}`,
        status === 429 || status >= 500,
      );
    }
    // Some gateways answer 200 with an error in the body.
    const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
    if (body && typeof body.status === 'number' && body.status >= 400) {
      throw new SmsDeliveryError(
        `Releans reported status ${body.status}`,
        body.status === 429 || body.status >= 500,
      );
    }
  }
}
