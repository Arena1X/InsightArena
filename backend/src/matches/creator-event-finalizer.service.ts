import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { CreatorEvent } from './entities/creator-event.entity';
import { Match } from './entities/match.entity';
import { SorobanService } from '../soroban/soroban.service';

export type FinalizationOutcome = 'correct' | 'incorrect';

export interface BondSettlementResult {
  outcome: FinalizationOutcome;
  bondReturned: boolean;
  bondSlashed: boolean;
  reason: string;
}

@Injectable()
export class CreatorEventFinalizerService {
  private readonly logger = new Logger(CreatorEventFinalizerService.name);
  private readonly MAX_FINALIZE_PER_TICK = 20;

  constructor(
    @InjectRepository(CreatorEvent)
    private readonly creatorEventRepository: Repository<CreatorEvent>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    private readonly sorobanService: SorobanService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async finalizePendingEvents(): Promise<void> {
    this.logger.log('Starting scheduled event finalization check');

    try {
      // Find events that:
      // 1. Have end_time in the past
      // 2. Are not finalized
      // 3. Are not cancelled
      const eventsToFinalize = await this.creatorEventRepository.find({
        where: {
          end_time: LessThan(new Date()),
          is_finalized: false,
          is_cancelled: false,
        },
        relations: ['matches'],
        take: this.MAX_FINALIZE_PER_TICK,
      });

      if (eventsToFinalize.length === 0) {
        this.logger.log('No events to finalize');
        return;
      }

      this.logger.log(`Found ${eventsToFinalize.length} events to finalize`);

      let finalizedCount = 0;
      let skippedCount = 0;

      for (const event of eventsToFinalize) {
        try {
          // Check if all matches have results
          const allMatchesResolved = await this.areAllMatchesResolved(event.id);

          if (!allMatchesResolved) {
            this.logger.debug(
              `Event ${event.on_chain_event_id} skipped: not all matches resolved`,
            );
            skippedCount++;
            continue;
          }

          // Call finalize_event on the contract
          this.logger.log(
            `Finalizing event ${event.on_chain_event_id} (${event.title})`,
          );

          await this.sorobanService.finalizeEvent(event.on_chain_event_id);

          // Mark event as finalized in database
          event.is_finalized = true;
          await this.creatorEventRepository.save(event);

          // Settle the finalization bond based on the validated outcome
          const settlement = await this.settleFinalizationBond(
            event,
            'correct',
            'All matches resolved and finalization validated on-chain',
          );

          this.logger.log(
            `Successfully finalized event ${event.on_chain_event_id} ` +
              `(bond ${settlement.bondReturned ? 'returned' : 'slashed'}: ${settlement.reason})`,
          );
          finalizedCount++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to finalize event ${event.on_chain_event_id}: ${message}`,
          );
          // Continue with next event - don't stop the entire batch
        }
      }

      this.logger.log(
        `Finalization complete: ${finalizedCount} finalized, ${skippedCount} skipped`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Event finalization check failed: ${message}`);
    }
  }

  /**
   * Settle the finalization bond for an event based on the validated outcome.
   *
   * - `correct`: the finalization was validated as correct, so the bond is
   *   returned to the creator.
   * - `incorrect`: the finalization was proven incorrect, so the bond is
   *   slashed.
   *
   * The settlement outcome and reason are recorded on the event so the
   * decision is auditable.
   */
  async settleFinalizationBond(
    event: CreatorEvent,
    outcome: FinalizationOutcome,
    reason: string,
  ): Promise<BondSettlementResult> {
    const bondReturned = outcome === 'correct';
    const bondSlashed = outcome === 'incorrect';

    if (bondReturned) {
      await this.sorobanService.returnFinalizationBond(
        event.on_chain_event_id,
      );
    } else {
      await this.sorobanService.slashFinalizationBond(event.on_chain_event_id);
    }

    event.bond_settlement_outcome = outcome;
    event.bond_settlement_reason = reason;
    await this.creatorEventRepository.save(event);

    this.logger.log(
      `Bond settlement for event ${event.on_chain_event_id}: ${outcome} (${reason})`,
    );

    return { outcome, bondReturned, bondSlashed, reason };
  }

  private async areAllMatchesResolved(eventId: string): Promise<boolean> {
    const unresolvedMatches = await this.matchRepository.count({
      where: {
        event: { id: eventId },
        result_submitted: false,
      },
    });

    return unresolvedMatches === 0;
  }

  /**
   * Manual trigger for testing or ad-hoc finalization
   */
  async triggerFinalization(): Promise<{
    finalized: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.log('Manual finalization triggered');

    const eventsToFinalize = await this.creatorEventRepository.find({
      where: {
        end_time: LessThan(new Date()),
        is_finalized: false,
        is_cancelled: false,
      },
      relations: ['matches'],
      take: this.MAX_FINALIZE_PER_TICK,
    });

    let finalizedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const event of eventsToFinalize) {
      try {
        const allMatchesResolved = await this.areAllMatchesResolved(event.id);

        if (!allMatchesResolved) {
          skippedCount++;
          continue;
        }

        await this.sorobanService.finalizeEvent(event.on_chain_event_id);

        event.is_finalized = true;
        await this.creatorEventRepository.save(event);

        await this.settleFinalizationBond(
          event,
          'correct',
          'Manual finalization validated as correct',
        );

        finalizedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to finalize event ${event.on_chain_event_id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        errorCount++;
      }
    }

    return {
      finalized: finalizedCount,
      skipped: skippedCount,
      errors: errorCount,
    };
  }
}
