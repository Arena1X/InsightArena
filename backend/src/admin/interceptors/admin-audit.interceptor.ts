import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';

interface AdminRequest {
  user?: { id: string };
  method: string;
  url: string;
  params: Record<string, string>;
  body: Record<string, unknown>;
}

function resolveAction(method: string, url: string): string {
  const path = url.split('?')[0];
  if (method === 'PATCH' && path.includes('/ban')) return 'BAN_USER';
  if (method === 'PATCH' && path.includes('/unban')) return 'UNBAN_USER';
  if (method === 'PATCH' && path.includes('/role')) return 'UPDATE_USER_ROLE';
  if (method === 'POST' && path.includes('/bulk-action'))
    return 'BULK_USER_ACTION';
  if (method === 'POST' && path.includes('/resolve')) return 'RESOLVE_MARKET';
  if (
    method === 'PATCH' &&
    path.includes('/feature') &&
    !path.includes('/unfeature')
  )
    return 'FEATURE_MARKET';
  if (method === 'PATCH' && path.includes('/unfeature'))
    return 'UNFEATURE_MARKET';
  if (method === 'PATCH' && path.includes('/moderate'))
    return 'MODERATE_COMMENT';
  if (method === 'PATCH' && path.includes('/flags')) return 'RESOLVE_FLAG';
  if (method === 'DELETE' && path.includes('/competitions'))
    return 'CANCEL_COMPETITION';
  return `${method}:${path}`;
}

function resolveTarget(
  url: string,
  params: Record<string, string>,
): { target_type: string | null; target_id: string | null } {
  const path = url.split('?')[0];
  const id = params?.id ?? null;
  if (path.includes('/users')) return { target_type: 'user', target_id: id };
  if (path.includes('/markets'))
    return { target_type: 'market', target_id: id };
  if (path.includes('/competitions'))
    return { target_type: 'competition', target_id: id };
  if (path.includes('/comments'))
    return { target_type: 'comment', target_id: id };
  if (path.includes('/flags')) return { target_type: 'flag', target_id: id };
  return { target_type: null, target_id: id };
}

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly auditRepo: Repository<AdminAuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const { user, method, url, params, body } = req;

    if (!user) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const action = resolveAction(method, url);
        const { target_type, target_id } = resolveTarget(url, params);

        const entry = this.auditRepo.create({
          actor_id: user.id,
          action,
          target_type,
          target_id,
          metadata: body ?? null,
        });

        void this.auditRepo.save(entry);
      }),
    );
  }
}
