import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // @Res() bilan stream/sendFile qilingan javob — header allaqachon yuborilgan
    if (res.headersSent) {
      if (exception instanceof Error) {
        this.logger.error(`Post-response error: ${exception.message}`, exception.stack);
      }
      res.end();
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Ichki server xatosi';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if (typeof body === 'object' && body && 'message' in body) {
        message = (body as any).message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      // Prisma unique
      if ((exception as any).code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Bu sana uchun yozuv allaqachon mavjud — yangilandi yoki konflikt';
      }
    }

    res.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
