import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getRequestId } from './request-context';

/**
 * Global exception filter — gives every error a uniform JSON shape and a
 * correlation id, logs server-side with full detail, and never leaks stack
 * traces or internal messages to the client on a 5xx.
 *
 * Response body: { statusCode, error, message, requestId, timestamp }
 * Also sets the `X-Request-Id` header so a user can quote it in a support report.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    // Reuse the per-request correlation id (set by the request-context
    // middleware) so the error response, its server log line, and every other
    // log from this request all share one id. Fall back for safety.
    const requestId =
      getRequestId() || (req.headers['x-request-id'] as string) || randomUUID();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Error interno del servidor';
    let error = 'Internal Server Error';
    // Optional machine-readable code (e.g. 'PASSWORD_CHANGE_REQUIRED') for the
    // client to branch on without parsing human text. Only set when the thrown
    // exception provides one.
    let code: string | undefined;

    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        error = (b.error as string) ?? error;
        if (typeof b.code === 'string') code = b.code;
      }
    }

    // Server-side logging: full detail (incl. stack) for unexpected/5xx errors,
    // a one-line warning for expected 4xx.
    if (!isHttp || status >= 500) {
      this.logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} → ${status}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      const text = Array.isArray(message) ? message.join('; ') : message;
      this.logger.warn(
        `[${requestId}] ${req.method} ${req.originalUrl} → ${status}: ${text}`,
      );
    }

    // If the response was already sent (e.g. an SSE stream), don't double-write.
    if (res.headersSent) return;

    res.setHeader('X-Request-Id', requestId);
    res.status(status).json({
      statusCode: status,
      error,
      ...(code ? { code } : {}),
      message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
