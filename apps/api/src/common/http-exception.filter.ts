import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from './app-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = '服务器内部错误';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = status === HttpStatus.UNAUTHORIZED ? 'UNAUTHORIZED' : `HTTP_${status}`;
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object') {
        const data = body as { message?: string | string[]; error?: string };
        message = Array.isArray(data.message) ? '请求参数无效' : (data.message ?? data.error ?? message);
        if (Array.isArray(data.message)) details = data.message;
      }
    } else {
      this.logger.error(
        `${request.method} ${request.url}: ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }

    response.status(status).json({
      error: { code, message, ...(details === undefined ? {} : { details }) },
    });
  }
}
