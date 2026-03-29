import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

interface UserRequest {
  user?: {
    is_banned: boolean;
    ban_reason: string | null;
  };
}

@Injectable()
export class BanGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const user = request.user;

    if (user && user.is_banned) {
      throw new ForbiddenException(
        `Your account has been banned. Reason: ${user.ban_reason || 'No reason provided'}`,
      );
    }

    return true;
  }
}
