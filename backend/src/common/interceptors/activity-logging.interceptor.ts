import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AnalyticsService } from '../../analytics/analytics.service';

interface UserRequest {
  user?: { id: string };
  method: string;
  url: string;
  body: Record<string, any>;
  ip: string;
}

@Injectable()
export class ActivityLoggingInterceptor implements NestInterceptor {
  constructor(private readonly analyticsService: AnalyticsService) {}

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
    return null;
  }

  private sanitizeBody(
    body: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!body) return null;
    const sanitized = { ...body };
    delete sanitized.password; // Example: never log sensitive data
    return sanitized;
  }
}
