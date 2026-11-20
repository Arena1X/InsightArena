import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  RemoveEvent,
} from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';

/**
 * Subscriber that enforces append-only behavior for AdminAuditLog at the database level.
 * This provides an additional layer of protection beyond the entity's @BeforeUpdate hook.
 *
 * This ensures audit logs cannot be:
 * - Updated (modified)
 * - Deleted (removed)
 *
 * Audit logs are immutable for compliance, security, and forensic integrity.
 */
@EventSubscriber()
export class AdminAuditLogSubscriber
  implements EntitySubscriberInterface<AdminAuditLog>
{
  listenTo() {
    return AdminAuditLog;
  }

  /**
   * Blocks any attempt to update an audit log entry.
   */
  beforeUpdate(event: UpdateEvent<AdminAuditLog>): void {
    throw new ForbiddenException(
      'Audit log entries are immutable and cannot be updated',
    );
  }

  /**
   * Blocks any attempt to delete an audit log entry.
   */
  beforeRemove(event: RemoveEvent<AdminAuditLog>): void {
    throw new ForbiddenException(
      'Audit log entries are immutable and cannot be deleted',
    );
  }
}
