import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AnalyticsService } from '../../analytics/analytics.service';

interface UserRequest {
  user?: { id: string };
  method: string;
  url: string;
  body: Record<string, unknown>;
  ip: string;
}

@Injectable()
export class ActivityLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly analyticsService: AnalyticsService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const { user, method, url, body, ip } = request;

    return next.handle().pipe(
      tap(() => {
        if (user && ['POST', 'PATCH', 'DELETE'].includes(method)) {
          // Log specific actions
          const actionType = this.getActionType(method, url);
          if (actionType) {
            void this.analyticsService.logActivity(
              user.id,
              actionType,
              this.sanitizeBody(body),
              ip,
            );
          }
        }
      }),
    );
  }

  private getActionType(method: string, url: string): string | null {
    if (url.includes('/markets') && method === 'POST') return 'MARKET_CREATED';
    if (url.includes('/predictions') && method === 'POST')
      return 'PREDICTION_MADE';
    if (url.includes('/competitions') && method === 'POST')
      return 'COMPETITION_CREATED';
    if (url.includes('/admin/users') && url.includes('/ban'))
      return 'USER_BANNED';
    if (url.includes('/admin/users') && url.includes('/unban'))
      return 'USER_UNBANNED';
    if (url.includes('/admin/markets') && url.includes('/resolve'))
      return 'MARKET_RESOLVED_BY_ADMIN';
    return null;
  }

  private sanitizeBody(
    body: unknown,
  ): Record<string, unknown> | null {
    if (!this.isRecord(body)) return null;

    const configuredFields =
      this.configService
        ?.get<string>('ACTIVITY_LOG_REDACT_FIELDS')
        ?.split(',')
        .map((field) => this.normalizeFieldName(field))
        .filter(Boolean) ?? [];
    return this.sanitizeObject(body, configuredFields);
  }

  private sanitizeObject(
    value: Record<string, unknown>,
    configuredFields: string[],
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [field, fieldValue] of Object.entries(value)) {
      const normalizedField = this.normalizeFieldName(field);
      if (this.isSensitiveField(normalizedField, configuredFields)) {
        continue;
      }

      if (Array.isArray(fieldValue)) {
        sanitized[field] = fieldValue.map((item) =>
          this.sanitizeValue(item, configuredFields),
        );
      } else if (this.isRecord(fieldValue)) {
        sanitized[field] = this.sanitizeObject(fieldValue, configuredFields);
      } else {
        sanitized[field] = fieldValue;
      }
    }

    return sanitized;
  }

  private sanitizeValue(value: unknown, configuredFields: string[]): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, configuredFields));
    }
    if (this.isRecord(value)) {
      return this.sanitizeObject(value, configuredFields);
    }
    return value;
  }

  private isSensitiveField(
    normalizedField: string,
    configuredFields: string[],
  ): boolean {
    return (
      ['email', 'password', 'token', 'secret'].some((field) =>
        normalizedField.includes(field),
      ) || configuredFields.includes(normalizedField)
    );
  }

  private normalizeFieldName(field: string): string {
    return field.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
