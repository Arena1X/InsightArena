import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { CreatorEventMatch } from '../../creator-events/entities/creator-event-match.entity';
import { OracleAssignment } from '../entities/oracle-assignment.entity';
import { WebhookMatchResultDto } from '../dto/webhook-match-result.dto';

/**
 * Confirms the reporting data_source is an active oracle assigned to the
 * event the submitted match belongs to. This runs after WebhookAuthGuard,
 * which only proves the request carries a valid signature — it says nothing
 * about which match/event the signer is allowed to report results for.
 */
@Injectable()
export class OracleAssignmentGuard implements CanActivate {
  private readonly logger = new Logger(OracleAssignmentGuard.name);

  constructor(
    @InjectRepository(CreatorEventMatch)
    private readonly matchRepository: Repository<CreatorEventMatch>,
    @InjectRepository(OracleAssignment)
    private readonly assignmentRepository: Repository<OracleAssignment>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as Partial<WebhookMatchResultDto>;

    if (!body?.match_id || !body?.data_source) {
      // Missing required fields — let DTO validation reject with a 400.
      return true;
    }

    const match = await this.matchRepository.findOne({
      where: { on_chain_match_id: body.match_id },
    });

    if (!match) {
      // Unknown match — let the service raise its own 404.
      return true;
    }

    const assignment = await this.assignmentRepository.findOne({
      where: { data_source: body.data_source, is_active: true },
    });

    if (!assignment) {
      this.logger.warn(
        `Rejected submission from unregistered oracle: data_source=${body.data_source}, match_id=${body.match_id}`,
      );
      throw new ForbiddenException(
        `Data source '${body.data_source}' is not a registered oracle`,
      );
    }

    if (assignment.event_id !== match.event_id) {
      this.logger.warn(
        `Rejected cross-event submission: data_source=${body.data_source}, match_id=${body.match_id}, assigned_event=${assignment.event_id}, match_event=${match.event_id}`,
      );
      throw new ForbiddenException(
        `Data source '${body.data_source}' is not authorized to report results for this match's event`,
      );
    }

    return true;
  }
}
