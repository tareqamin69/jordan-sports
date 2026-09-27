import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ErrorCode, ProblemDetails } from '@jordan-sports/contracts';
import type { FastifyReply } from 'fastify';
import { AppError } from './errors.js';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'BAD_REQUEST',
  413: 'BAD_REQUEST',
  415: 'BAD_REQUEST',
  429: 'RATE_LIMITED',
};

/** Renders every error as `application/problem+json` without leaking internals. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let body: ProblemDetails;

    if (exception instanceof AppError) {
      body = {
        type: 'about:blank',
        title: exception.code,
        status: exception.status,
        code: exception.code,
        ...(exception.detail ? { detail: exception.detail } : {}),
        ...(exception.extra ?? {}),
      };
      if (
        exception.code === 'RATE_LIMITED' &&
        typeof exception.extra?.retryAfterSeconds === 'number'
      ) {
        void reply.header('retry-after', String(exception.extra.retryAfterSeconds));
      }
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
      body = { type: 'about:blank', title: code, status, code };
    } else {
      const status =
        typeof exception === 'object' &&
        exception !== null &&
        'statusCode' in exception &&
        typeof (exception as { statusCode: unknown }).statusCode === 'number' &&
        (exception as { statusCode: number }).statusCode < 500
          ? (exception as { statusCode: number }).statusCode
          : 500;
      if (status >= 500) this.logger.error(exception);
      const code = STATUS_CODES[status] ?? 'INTERNAL_ERROR';
      body = { type: 'about:blank', title: code, status, code };
    }

    void reply.status(body.status).header('content-type', 'application/problem+json').send(body);
  }
}
